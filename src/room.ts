import { createWorker } from "mediasoup";
import { AudioLevelObserver } from "mediasoup/lib/AudioLevelObserver";
import { Router } from "mediasoup/lib/Router";
import { Worker } from "mediasoup/lib/Worker";
import { config } from "./config";
import { Peer } from "./types/peer";
import { Transport } from "mediasoup/lib/Transport";
import { Producer } from "mediasoup/lib/Producer";
import { RtpCapabilities } from "mediasoup/lib/RtpParameters";
import { TransportDirection } from "./types/transport-direction";

export class Room {
  /**
   * Peers map
   */
  private readonly peers: { [key: string]: Peer } = {};

  /**
   * Active speaker info
   */
  private readonly activeSpeaker = {
    producerId: null,
    volume: null,
    peerId: null,
  };

  /**
   * Transports map
   */
  private readonly transports: { [key: string]: Transport } = {};

  /**
   * List of producers
   */
  private videoProducer?: Producer;
  private audioProducer?: Producer;

  /**
   * List of consumers
   */
  private readonly consumers = [];

  /**
   * Worker
   */
  private readonly worker: Worker;

  /**
   * Router
   */
  private readonly router: Router;

  /**
   * AudioLevelObserver
   */
  private readonly audioLevelObserver: AudioLevelObserver;

  /**
   * Make new room instance
   */
  static async makeRoom() {
    // create a worker
    const worker = await createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    // handle worker error
    worker.on("died", () => {
      console.error("mediasoup worker died (this should never happen)");
      process.exit(1);
    });

    // create a router
    const router = await worker.createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs,
    });

    // create an AudioLevelObserver object
    const audioLevelObserver = await router.createAudioLevelObserver({
      interval: 800,
    });

    return new Room(worker, router, audioLevelObserver);
  }

  private constructor(worker: Worker, router: Router, audioLevelObserver: AudioLevelObserver) {
    this.worker = worker;
    this.router = router;
    this.audioLevelObserver = audioLevelObserver;

    // handle audio level volume change
    audioLevelObserver.on("volumes", (volumes) => {
      const { producer, volume } = volumes[0];
      console.log("audio-level volumes event", producer.appData.peerId, volume);

      // change active speaker
      this.activeSpeaker.producerId = producer.id;
      this.activeSpeaker.volume = volume;
      this.activeSpeaker.peerId = producer.appData.peerId;
    });

    audioLevelObserver.on("silence", () => {
      console.log("audio-level silence event");
      this.activeSpeaker.producerId = null;
      this.activeSpeaker.volume = null;
      this.activeSpeaker.peerId = null;
    });
  }

  /**
   * Peer id
   *
   * @param peerId
   */
  joinPeer(peerId: string) {
    console.log(`peer joined ${peerId}`);

    this.peers[peerId] = {
      joinTime: new Date(),
      lastSeenTime: new Date(),
      media: {},
      consumerLayers: {},
      stats: {},
    };
  }

  addTransport(transport: Transport) {
    this.transports[transport.id] = transport;
  }

  getRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  async createTransport(peerId: string, direction: "send" | "receive") {
    const { listenIps, initialAvailableOutgoingBitrate } = config.mediasoup.webRtcTransport;

    const transport = await this.router.createWebRtcTransport({
      listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate,
      appData: { peerId, clientDirection: direction },
    });

    // save transport
    this.transports[transport.id] = transport;

    return transport;
  }

  canConsume(producerId: string, rtpCapabilities: RtpCapabilities) {
    return this.router.canConsume({ producerId, rtpCapabilities });
  }

  getTransport(transportId: string) {
    return this.transports[transportId];
  }

  getTransportByPeerId(peerId: string, direction: TransportDirection) {
    return Object.values(this.transports).find(
      (transport) =>
        transport.appData.peerId === peerId && transport.appData.clientDirection === direction
    );
  }

  setVideoProducer(producer: Producer) {
    this.videoProducer = producer;
  }

  getVideoProducer() {
    return this.videoProducer;
  }

  setAudioProducer(producer: Producer) {
    this.audioProducer = producer;
  }

  getAudioProducer() {
    return this.audioProducer;
  }
}
