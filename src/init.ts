import { pick } from "lodash";
import { Server, Socket } from "socket.io";
import { v4 as uuidV4 } from "uuid";
import { Room } from "./room";
import { TransportDirection } from "./types/transport-direction";
import { DtlsParameters } from "mediasoup/lib/WebRtcTransport";
import { MediaKind, RtpParameters } from "mediasoup/lib/RtpParameters";

export function init(ioServer: Server, room: Room) {
  ioServer.on("connection", (socket: Socket) => {
    const peerId = uuidV4();
    socket.data.peerId = peerId;
    console.log(`Peer ${peerId} connected`);

    // join peer to room
    room.joinPeer(peerId);

    const socketOn = (event: string, func: (...args: any[]) => Promise<any>) => {
      socket.on(event, (...args: any[]) => {
        // get callback from args array
        const callback = args.pop();

        // call function with args and call callback when promise resolved
        func(...args)
          .then((result: any) => callback({ result }))
          .catch((error) => callback({ error }));
      });
    };

    socketOn("getRouterRtpCapabilities", async () => room.getRtpCapabilities());

    socketOn("createTransport", async (direction: TransportDirection) => {
      const transport = await room.createTransport(socket.data.peerId, direction);
      room.addTransport(transport);

      return {
        transportOptions: pick(transport, "id", "iceParameters", "iceCandidates", "dtlsParameters"),
      };
    });

    socketOn("connectTransport", async (transportId: string, dtlsParameters: DtlsParameters) => {
      const transport = room.getTransport(transportId);

      if (!transport) {
        console.log(`Server side transport ${transportId} not found`);
        throw new Error(`Server side transport ${transportId} not found`);
      }

      await transport.connect({ dtlsParameters });
      return true;
    });

    socketOn(
      "sendTrack",
      async (transportId: string, kind: MediaKind, rtpParameters: RtpParameters, appData: any) => {
        const transport = room.getTransport(transportId);
        if (!transport) {
          throw new Error(`Transport ${transportId} does not exist`);
        }

        // create producer
        const producer = await transport.produce({
          kind,
          rtpParameters,
          paused: false,
          appData: { ...appData, peerId: socket.data.peerId, transportId },
        });

        // set producer
        if (kind === "video") {
          room.setVideoProducer(producer!);
        } else {
          room.setAudioProducer(producer);
        }

        return { id: producer.id };
      }
    );

    socketOn("receiveTrack", async (mediaType, rtpCapabilities) => {
      console.log(`Receiving ${mediaType} track...`);
      const producer = mediaType === "video" ? room.getVideoProducer() : room.getAudioProducer();

      if (!room.canConsume(producer!.id, rtpCapabilities)) {
        throw new Error("Can't consume this producer");
      }

      const transport = room.getTransportByPeerId(socket.data.peerId, "receive");

      const consumer = await transport!.consume({
        producerId: producer!.id,
        rtpCapabilities,
        paused: false,
        appData: { peerId, mediaType },
      });

      return {
        producerId: producer!.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      };
    });
  });
}
