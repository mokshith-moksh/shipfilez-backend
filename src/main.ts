import { WebSocketServer, WebSocket } from "ws";
interface typeNearByShareCode {
  event: EventType.RequestNearByShareCode;
  shareCode: string;
}
interface typeShareCode {
  event: EventType.RequestShareCode;
  fileName: string[];
  fileLength: number;
}
interface typeGenClientId {
  event: EventType.RequestClientId;
  shareCode: string;
}
interface typeRequestHostToSendOfferMsg {
  event: EventType.RequestHostToSendOffer;
  shareCode: string;
  clientId: string;
}

interface typeSendOfferToClient {
  event: EventType.SendOfferToClient;
  shareCode: string;
  clientId: string;
  offer: any;
}
interface typeSendAnswerToHost {
  event: EventType.SendAnswerToHost;
  shareCode: string;
  clientId: string;
  answer: any;
}
interface typeExchangeIceCandidate {
  event: EventType.IceCandidate;
  shareCode: string;
  clientId: string;
  candidate: any;
  from: string;
}
enum EventType {
  RequestShareCode = "EVENT_REQUEST_SHARE_CODE",
  RequestClientId = "EVENT_REQUEST_CLIENT_ID",
  SendOfferToClient = "EVENT_OFFER",
  SendAnswerToHost = "EVENT_ANSWER",
  IceCandidate = "EVENT_ICE_CANDIDATE",
  RequestHostToSendOffer = "EVENT_REQUEST_HOST_TO_SEND_OFFER",
  RequestNearByShareCode = "EVENT_REQUEST_NEAR_BY_SHARE_CODE",
}

const wss = new WebSocketServer({ port: 8080 });
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

wss.on("connection", (ws: WebSocket) => {
  console.log("New client connected");

  ws.on("message", (message: string) => {
    const msg = JSON.parse(message);

    switch (msg.event) {
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
  console.log(`Client ${clientId} added to session ${sharedCode}`);
}

function requestHostToSendOffer(
  ws: WebSocket,

  msg: typeRequestHostToSendOfferMsg
): void {
  console.log("shareCode " + msg.shareCode);
  const sharedCode = msg.shareCode;
  const hostWs = sessions[sharedCode].hostWS;
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
  const clientId = msg.clientId;
  const session = sessions[sharedCode];
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

// Helper function to generate a random share code
function generateShareCode(): string {
  return Math.random().toString(36).substr(2, 10);
}

// Helper function to generate a unique origin ID for clients
function generateUniqueOrigin(): string {
  return Math.random().toString(36).substr(2, 10);
}

function generateFourDigitCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function addKeyValue(key: string, value: string) {
  if (!store.has(key)) {
    store.set(key, value);
  } else {
    console.log(`Duplicate key detected: ${key}. Value not added.`);
  }
}

console.log("WebSocket signaling server is running on ws://localhost:8080");
