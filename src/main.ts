import { WebSocketServer, WebSocket } from "ws";
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
import http from "http";
import express from "express";
import {
  generateShareCode,
  generateUniqueOrigin,
  generateFourDigitCode,
} from "./helper";
import cors from "cors";
const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  })
);

app.get("/", (req, res) => {
  res.status(200).json({ message: "OK" });
});

//If needed to scale replace with redis
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
//If needed to scale replace with redis
const store = new Map<string, string>();

wss.on("connection", (ws: WebSocket, req) => {
  const origin = req.headers.origin;
  if (origin !== "http://localhost:3000") {
    ws.close(1008, "Origin not allowed");
    return;
  }
  console.log("New client connected");

  ws.on("message", (message: string) => {
    const msg = JSON.parse(message);

    switch (msg.event) {
      case EventType.EVENT_HEART_BEAT:
        const response = JSON.stringify({
          event: "event_heartbeat_response",
          server_time: new Date().toISOString(),
        });
        ws.send(response);
        break;
      case EventType.RequestShareCode:
        handleShareCodeRequest(ws, msg);
        break;

      case EventType.RequestClientId:
        genrateClientIdRequest(ws, msg);
        break;

      case EventType.RequestHostToSendOffer:
        requestHostToSendOffer(ws, msg);
        break;

      case EventType.SendOfferToClient:
        SendOfferToClient(ws, msg);
        break;

      case EventType.SendAnswerToHost:
        SendAnswerToHost(msg);
        break;

      case EventType.IceCandidate:
        ExchangeIceCandidate(ws, msg);
        break;

      case EventType.RequestNearByShareCode:
        generateNearByShareCode(ws, msg);
        break;

      default:
        console.log("Unknown event:", msg.event);
    }
  });
  ws.on("close", () => {
    console.log("Client disconnected");
    // Find and delete the session if this was the host
    for (const shareCode in sessions) {
      const session = sessions[shareCode];
      if (session.hostWS === ws) {
        // Remove session data from both sessions and store
        delete sessions[shareCode];
        for (const [key, value] of store.entries()) {
          if (value === shareCode) {
            store.delete(key);
          }
        }
        console.log(`Session ${shareCode} deleted due to host disconnection`);
        break;
      }
    }
  });
});

function handleShareCodeRequest(ws: WebSocket, msg: typeShareCode): void {
  const shareCode = generateShareCode();
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
}

function genrateClientIdRequest(ws: WebSocket, msg: typeGenClientId): void {
  const clientId = generateUniqueOrigin();
  const IshareCode = msg.shareCode;
  const sharedCode = store.has(IshareCode) ? store.get(IshareCode) : IshareCode;
  console.log("Shared Code Inside 1st request from client:", sharedCode);
  if (!sharedCode) {
    console.log("share code is not available in ClientID");
    return;
  }
  const session = sessions[sharedCode];
  if (!session) {
    ws.send(JSON.stringify({ event: "ERROR", message: "Invalid share code" }));
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
  console.log("filedeatail", session.fileName, session.fileLength);
  console.log(`Client ${clientId} added to session ${sharedCode}`);
}

function requestHostToSendOffer(
  ws: WebSocket,

  msg: typeRequestHostToSendOfferMsg
): void {
  console.log("shareCode " + msg.shareCode);
  const sharedCode = msg.shareCode;
  if (!sharedCode) {
    console.log("No shared code");
    return;
  }
  const hostWs = sessions[sharedCode].hostWS;
  if (!hostWs) {
    console.log("No Host WS");
    return;
  }
  hostWs.send(
    JSON.stringify({
      event: EventType.RequestHostToSendOffer,
      clientId: msg.clientId,
      shareCode: msg.shareCode,
    })
  );
}

function SendOfferToClient(ws: WebSocket, msg: typeSendOfferToClient): void {
  const sharedCode = msg.shareCode;
  const clientId = msg.clientId;
  const session = sessions[sharedCode];
  if (!session || session.hostWS !== ws) {
    console.log("Host not fount", sharedCode);
    ws.send(
      JSON.stringify({
        event: "NOT_A_HOST",
      })
    );
    return;
  }
  const clientWs = session.clients.find(
    (client) => client.clientId === clientId
  );
  if (!clientWs) {
    console.log("Client not fount");
    JSON.stringify({
      event: "NO_CLIENT_FOUND",
    });
    return;
  }
  clientWs.clientWS.send(
    JSON.stringify({
      event: EventType.SendOfferToClient,
      offer: msg.offer,
      sharedCode,
      clientId,
    })
  );
}

function SendAnswerToHost(msg: typeSendAnswerToHost): void {
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
  session.hostWS.send(
    JSON.stringify({
      event: EventType.SendAnswerToHost,
      answer: msg.answer,
      sharedCode,
      clientId,
    })
  );
}

function ExchangeIceCandidate(
  ws: WebSocket,
  msg: typeExchangeIceCandidate
): void {
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
  console.log("Client ID from massage", msg.from);
  const clientWs = session.clients.find(
    (client) => client.clientId === msg.clientId
  );
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
    }
  } else if (clientWs?.clientWS === ws) {
    console.log("Inside IceCandidate");
    session.hostWS.send(
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
        message: "Invalid client",
      })
    );
  }
}

function generateNearByShareCode(ws: WebSocket, msg: typeNearByShareCode) {
  const sharedCode = msg.shareCode;
  const session = sessions[msg.shareCode];
  if (!sharedCode) {
    console.log("There is no Share Code!!!!!");
    return;
  }
  if (ws !== session.hostWS) {
    console.log("Incorrect Host WS");
    return;
  }
  let nearByShareCode = generateFourDigitCode();
  if (!nearByShareCode) {
    console.log("Not able to generate 4 digit Share Code");
    return;
  }

  session.nearByShareCode = nearByShareCode;
  if (!store.has(nearByShareCode)) {
    store.set(nearByShareCode, sharedCode);
  } else {
    nearByShareCode = generateFourDigitCode();
    store.set(nearByShareCode, sharedCode);
  }
  console.log("updated shared Code in session", nearByShareCode);
  session.hostWS.send(
    JSON.stringify({
      event: EventType.RequestNearByShareCode,
      nearByShareCode,
    })
  );
}

server.listen(8080, () => {
  console.log(`Server is running on http://localhost:${8080}`);
});
