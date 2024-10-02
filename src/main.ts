import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";

interface Message {
  event: EventType;
  data?: any;
  destination?: string;
  origin?: string;
  sdp?: any;
  nuberOfFile?: number;
  candidate?: any;
  from?: string;
}

enum EventType {
  RequestShareCode = "EVENT_REQUEST_SHARE_CODE",
  ConnectionRequest = "EVENT_CONNECTION_REQUEST",
  RemoteDescription = "EVENT_REMOTE_DESCRIPTION",
  IceCandidate = "EVENT_ICE_CANDIDATE",
  Heartbeat = "EVENT_HEARTBEAT",
  ConnectionAccept = "EVENT_CONNECTION_ACCEPT",
}

const wss = new WebSocketServer({ port: 8080 });

const sessions: {
  [shareCode: string]: {
    hostWS: WebSocket;
    clients: {
      originId: string;
      clientWS: WebSocket;
    }[];
  };
} = {};

wss.on("connection", (ws: WebSocket) => {
  console.log("New client connected");

  ws.on("message", (message: string) => {
    const msg: Message = JSON.parse(message);

    switch (msg.event) {
      case EventType.RequestShareCode:
        handleShareCodeRequest(ws);
        break;

      case EventType.ConnectionRequest:
        handleConnectionRequest(ws, msg);
        break;

      case EventType.ConnectionAccept:
        handleConnectionAccept(msg);
        break;

      case EventType.RemoteDescription:
      case EventType.IceCandidate:
        relayMessage(msg);
        break;

      case EventType.Heartbeat:
        handleHeartbeat(ws);
        break;

      default:
        console.log("Unknown event:", msg.event);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    // Optionally, you can handle cleanup
  });
});

// Generate a unique share code for the host and store the session
function handleShareCodeRequest(ws: WebSocket): void {
  const shareCode = generateShareCode();

  // Create a new session with hostWS and empty clients array
  sessions[shareCode] = { hostWS: ws, clients: [] };

  // Send share code back to the host
  ws.send(
    JSON.stringify({
      event: EventType.RequestShareCode,
      shareCode,
    })
  );

  console.log("Created session:", shareCode);
}

// Handle connection request from a client using the share code
function handleConnectionRequest(ws: WebSocket, msg: Message): void {
  const { destination } = msg;
  console.log(destination);
  if (!destination || !sessions[destination]) {
    ws.send(JSON.stringify({ error: "Host not found" }));
    return;
  }

  // Get the session by share code
  const session = sessions[destination];

  // Generate a unique origin ID for the client
  const assignedOrigin = generateUniqueOrigin();

  // Store the client's information in the session
  session.clients.push({ originId: assignedOrigin, clientWS: ws });

  // Notify the host of the new connection request
  session.hostWS.send(
    JSON.stringify({
      event: EventType.ConnectionRequest,
      origin: assignedOrigin,
      shareCode: destination,
    })
  );

  // Respond to the client with connection success
  ws.send(
    JSON.stringify({
      event: EventType.ConnectionRequest,
      data: { assignedOrigin, success: true },
    })
  );

  console.log("Client connected to session:", destination);
}

function handleConnectionAccept(msg: Message) {
  const { destination, nuberOfFile, origin } = msg;
  if (!destination) {
    console.log("there is no destination/shareCode");
    return;
  }
  const session = sessions[destination];
  const clientWs = session.clients.find((client) => client.originId === origin);
  clientWs?.clientWS.send(
    JSON.stringify({
      event: EventType.ConnectionAccept,
      fileLength: nuberOfFile,
      destination,
      origin,
    })
  );
  console.log(sessions);
}

// Relay SDP offers/answers and ICE candidates between peers
function relayMessage(msg: Message): void {
  console.log(JSON.stringify(msg.from));
  console.log(JSON.stringify(msg.destination));
  const { destination } = msg;
  if (destination) {
    // Check if destination is a host and relay to the host
    if (sessions[destination]) {
      console.log("Message sent to HOST");
      sessions[destination].hostWS.send(JSON.stringify(msg));
    } else {
      // Relay to the specific client
      console.log("Message sent to CLIENT");
      Object.values(sessions).forEach((session) => {
        const client = session.clients.find(
          (client) => client.originId === destination
        );
        if (client) {
          client.clientWS.send(JSON.stringify(msg));
        }
      });
    }
  } else {
    console.log(`No peer found for destination: ${destination}`);
  }
}

// Handle heartbeat to keep the connection alive
function handleHeartbeat(ws: WebSocket): void {
  ws.send(
    JSON.stringify({
      event: EventType.Heartbeat,
      data: { timestamp: new Date().toISOString() },
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

console.log("WebSocket signaling server is running on ws://localhost:8080");
