import http from "http";
import { Server } from "socket.io";
import { init } from "./init";
import { Room } from "./room";
import { config } from "./config";

run().catch((e) => console.error(e));

async function run() {
  const httpServer = http.createServer((req, res) => {
    res.end("Hello World");
  });

  const socketServer = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });
  const room = await Room.makeRoom();

  init(socketServer, room);

  httpServer.listen(config.http.port, "0.0.0.0", () => {
    console.log(`Listening on port :${config.http.port}`);
  });
}
