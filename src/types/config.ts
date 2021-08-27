import { RouterOptions } from "mediasoup/lib/Router";
import { WebRtcTransportOptions } from "mediasoup/lib/WebRtcTransport";
import { WorkerSettings } from "mediasoup/lib/Worker";

export interface Config {
  http: {
    ip: string;
    port: number;
  };

  mediasoup: {
    worker: WorkerSettings;
    router: RouterOptions;
    webRtcTransport: WebRtcTransportOptions;
  };
}
