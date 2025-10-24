import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import express from "express";
import cors from "cors";
import "dotenv/config";

import {
  EventType,
  typeExchangeIceCandidate,
  typeGenClientId,
  typeNearByShareCode,
  typeRequestHostToSendOfferMsg,
  typeSendAnswerToHost,
  typeSendOfferToClient,
  typeShareCode,
} from "./types";

import {
  genrateSessionId,
  genrateClientId,
  generateFourDigitCode,
} from "./helper";

const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  })
);

app.get("/", (req, res) => {
  res.status(200).json({ message: "OK" });
});

const sessions: {
  [shareCode: string]: {
    hostWS: WebSocket;
    fileName: string[];
    fileLength: number;
    nearByShareCode?: string;
    clients: {
      clientId: string;
      clientWS: WebSocket;
    }[];
  };
} = {};

const store = new Map<string, string>();

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
});

wss.on("connection", (ws: WebSocket, req) => {
  console.log("New client connected");

  // socket-level error handler
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });

  // When a socket closes, remove host or client safely
  ws.on("close", () => {
    console.log("Client disconnected");
    // Find whether this was a host or client
    for (const shareCode of Object.keys(sessions)) {
      const session = sessions[shareCode];
      if (!session) continue;

      // If it was the host, remove entire session and any store mappings
      if (session.hostWS === ws) {
        delete sessions[shareCode];
        // remove any store entries that map to this shareCode
        for (const [key, value] of store.entries()) {
          if (value === shareCode) {
            store.delete(key);
          }
        }
        console.log(`Session ${shareCode} deleted due to host disconnection`);
        continue;
      }

      // Otherwise, remove the client from session.clients if present
      const before = session.clients.length;
      session.clients = session.clients.filter((c) => c.clientWS !== ws);
      if (session.clients.length !== before) {
        console.log(`Removed a client from session ${shareCode}`);
      }
    }
  });

  ws.on("message", (message: string | Buffer | ArrayBuffer | Buffer[]) => {
    try {
      if (!message) {
        return;
      }
      const raw = typeof message === "string" ? message : message.toString();
      const msg = JSON.parse(raw);

      if (!msg || typeof msg !== "object" || !msg.event) {
        ws.send(
          JSON.stringify({
            event: "ERROR",
            message: "Invalid message format or missing event",
          })
        );
        return;
      }

      switch (msg.event) {
        case EventType.EVENT_HEART_BEAT: {
          const response = JSON.stringify({
            event: "event_heartbeat_response",
            server_time: new Date().toISOString(),
          });
          ws.send(response);
          break;
        }

        case EventType.RequestShareCode:
          handleShareCodeRequest(ws, msg as typeShareCode);
          break;

        case EventType.RequestClientId:
          genrateClientIdRequest(ws, msg as typeGenClientId);
          break;

        case EventType.RequestHostToSendOffer:
          requestHostToSendOffer(ws, msg as typeRequestHostToSendOfferMsg);
          break;

        case EventType.SendOfferToClient:
          SendOfferToClient(ws, msg as typeSendOfferToClient);
          break;

        case EventType.SendAnswerToHost:
          SendAnswerToHost(msg as typeSendAnswerToHost);
          break;

        case EventType.IceCandidate:
          ExchangeIceCandidate(ws, msg as typeExchangeIceCandidate);
          break;

        case EventType.RequestNearByShareCode:
          generateNearByShareCode(ws, msg as typeNearByShareCode);
          break;

        default:
          console.log("Unknown event:", msg.event);
          ws.send(
            JSON.stringify({
              event: "ERROR",
              message: `Unknown event: ${String(msg.event)}`,
            })
          );
      }
    } catch (err) {
      console.error("Error handling message:", err);
      try {
        ws.send(
          JSON.stringify({
            event: "ERROR",
            message: "Invalid request format or internal error",
          })
        );
      } catch (sendErr) {
        console.error("Failed to send error to client:", sendErr);
      }
    }
  });
});

function handleShareCodeRequest(ws: WebSocket, msg: typeShareCode): void {
  try {
    const shareCode = genrateSessionId();
    sessions[shareCode] = {
      hostWS: ws,
      clients: [],
      fileLength: msg.fileLength,
      fileName: msg.fileName,
    };
    ws.send(
      JSON.stringify({
        event: EventType.RequestShareCode,
        fileLength: msg.fileLength,
        fileName: msg.fileName,
        shareCode,
      })
    );
    console.log("Created session:", shareCode);
  } catch (err) {
    console.error("handleShareCodeRequest error:", err);
    ws.send(
      JSON.stringify({ event: "ERROR", message: "Could not create share" })
    );
  }
}

function genrateClientIdRequest(ws: WebSocket, msg: typeGenClientId): void {
  try {
    const clientId = genrateClientId();
    const sharecodeFromClient = msg.shareCode;
    let sharedCode;

    if (sharecodeFromClient.length == 4 && store.has(sharecodeFromClient)) {
      console.log("code is entered from nearby and store has it");
      sharedCode = store.get(sharecodeFromClient);
    } else if (sessions[sharecodeFromClient]) {
      console.log("code is auto and sessions has it");
      sharedCode = sharecodeFromClient;
    }

    if (!sharedCode) {
      console.log("get out of here");
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Invalid share code" })
      );
      console.log("share code is not available in ClientID");
      ws.close();
      return;
    }
    const session = sessions[sharedCode];
    if (!session) {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Invalid share code" })
      );
      return;
    }

    session.clients.push({ clientId, clientWS: ws });
    ws.send(
      JSON.stringify({
        event: EventType.RequestClientId,
        clientId,
        fileName: session.fileName,
        fileLength: session.fileLength,
        sharedCode: sharedCode,
      })
    );
    console.log("filedetail", session.fileName, session.fileLength);
    console.log(`Client ${clientId} added to session ${sharedCode}`);
  } catch (err) {
    console.error("genrateClientIdRequest error:", err);
    ws.send(
      JSON.stringify({ event: "ERROR", message: "Internal server error" })
    );
  }
}

function requestHostToSendOffer(
  ws: WebSocket,
  msg: typeRequestHostToSendOfferMsg
): void {
  try {
    console.log("shareCode " + msg.shareCode);
    const sharedCode = msg.shareCode;
    if (!sharedCode) {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Missing share code" })
      );
      return;
    }
    const session = sessions[sharedCode];
    if (!session) {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Invalid share code" })
      );
      return;
    }
    const hostWs = session.hostWS;
    if (!hostWs) {
      ws.send(JSON.stringify({ event: "ERROR", message: "No host found" }));
      return;
    }
    hostWs.send(
      JSON.stringify({
        event: EventType.RequestHostToSendOffer,
        clientId: msg.clientId,
        shareCode: msg.shareCode,
      })
    );
  } catch (err) {
    console.error("requestHostToSendOffer error:", err);
    ws.send(
      JSON.stringify({ event: "ERROR", message: "Internal server error" })
    );
  }
}

function SendOfferToClient(ws: WebSocket, msg: typeSendOfferToClient): void {
  try {
    const sharedCode = msg.shareCode;
    const clientId = msg.clientId;
    if (!sharedCode) {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Missing share code" })
      );
      return;
    }
    const session = sessions[sharedCode];
    if (!session) {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Invalid share code" })
      );
      return;
    }
    if (session.hostWS !== ws) {
      console.log("Host not found or socket mismatch", sharedCode);
      ws.send(JSON.stringify({ event: "NOT_A_HOST" }));
      return;
    }
    const clientEntry = session.clients.find(
      (client) => client.clientId === clientId
    );
    if (!clientEntry) {
      console.log("Client not found", clientId);
      ws.send(JSON.stringify({ event: "NO_CLIENT_FOUND" }));
      return;
    }
    // send offer to client
    clientEntry.clientWS.send(
      JSON.stringify({
        event: EventType.SendOfferToClient,
        offer: msg.offer,
        sharedCode,
        clientId,
      })
    );
  } catch (err) {
    console.error("SendOfferToClient error:", err);
    ws.send(
      JSON.stringify({ event: "ERROR", message: "Internal server error" })
    );
  }
}

function SendAnswerToHost(msg: typeSendAnswerToHost): void {
  try {
    const sharedCode = msg.shareCode;
    if (!sharedCode) {
      console.log("No shared code");
      return;
    }
    const clientId = msg.clientId;
    if (!clientId) {
      console.log("No client code");
      return;
    }
    const session = sessions[sharedCode];
    if (!session) {
      console.log("No session code");
      return;
    }
    console.log("Inside SendAnswerToHost", sharedCode);
    // send answer to host (hostWS should exist)
    try {
      session.hostWS.send(
        JSON.stringify({
          event: EventType.SendAnswerToHost,
          answer: msg.answer,
          sharedCode,
          clientId,
        })
      );
    } catch (sendErr) {
      console.error("Failed to send answer to host:", sendErr);
    }
  } catch (err) {
    console.error("SendAnswerToHost error:", err);
  }
}

function ExchangeIceCandidate(
  ws: WebSocket,
  msg: typeExchangeIceCandidate
): void {
  try {
    if (!msg || !msg.shareCode) {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Missing share code" })
      );
      return;
    }
    const session = sessions[msg.shareCode];

    if (!session) {
      ws.send(
        JSON.stringify({
          event: "ERROR",
          message: "Invalid share code",
        })
      );
      return;
    }
    console.log("Client ID from message", msg.from);
    const clientWs = session.clients.find(
      (client) => client.clientId === msg.clientId
    );

    // If the sender is the host, forward to the client
    if (ws === session.hostWS) {
      if (clientWs?.clientWS) {
        clientWs.clientWS.send(
          JSON.stringify({
            event: EventType.IceCandidate,
            candidate: msg.candidate,
            clientId: msg.clientId,
            shareCode: msg.shareCode,
          })
        );
      } else {
        ws.send(
          JSON.stringify({
            event: "ERROR",
            message: "Client not found for ICE candidate",
          })
        );
      }
      return;
    }

    // If the sender is a client, forward to host
    if (clientWs?.clientWS === ws) {
      console.log("Inside IceCandidate (client -> host)");
      try {
        session.hostWS.send(
          JSON.stringify({
            event: EventType.IceCandidate,
            candidate: msg.candidate,
            clientId: msg.clientId,
            shareCode: msg.shareCode,
          })
        );
      } catch (sendErr) {
        console.error("Failed to forward ICE candidate to host:", sendErr);
      }
      return;
    }

    // Otherwise it's an invalid client
    ws.send(
      JSON.stringify({
        event: "ERROR",
        message: "Invalid client or permission",
      })
    );
  } catch (err) {
    console.error("ExchangeIceCandidate error:", err);
    try {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Internal server error" })
      );
    } catch {}
  }
}

function generateNearByShareCode(ws: WebSocket, msg: typeNearByShareCode) {
  try {
    const sharedCode = msg.shareCode;
    if (!sharedCode) {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Missing share code" })
      );
      console.log("There is no Share Code!!!!!");
      return;
    }
    const session = sessions[sharedCode];
    if (!session) {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Invalid share code" })
      );
      return;
    }
    if (ws !== session.hostWS) {
      ws.send(
        JSON.stringify({
          event: "ERROR",
          message: "Only host can request nearby code",
        })
      );
      console.log("Incorrect Host WS");
      return;
    }
    let nearByShareCode = generateFourDigitCode();
    if (!nearByShareCode) {
      ws.send(
        JSON.stringify({
          event: "ERROR",
          message: "Could not generate nearby code",
        })
      );
      console.log("Not able to generate 4 digit Share Code");
      return;
    }

    // ensure uniqueness (simple loop with guard)
    let attempts = 0;
    while (store.has(nearByShareCode) && attempts < 10) {
      nearByShareCode = generateFourDigitCode();
      attempts++;
    }
    // if still colliding, respond with error
    if (store.has(nearByShareCode)) {
      ws.send(
        JSON.stringify({
          event: "ERROR",
          message: "Unable to create unique nearby code",
        })
      );
      return;
    }

    session.nearByShareCode = nearByShareCode;
    store.set(nearByShareCode, sharedCode);

    console.log("updated shared Code in session", nearByShareCode);
    session.hostWS.send(
      JSON.stringify({
        event: EventType.RequestNearByShareCode,
        nearByShareCode,
      })
    );
  } catch (err) {
    console.error("generateNearByShareCode error:", err);
    try {
      ws.send(
        JSON.stringify({ event: "ERROR", message: "Internal server error" })
      );
    } catch {}
  }
}

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

// export default server;
