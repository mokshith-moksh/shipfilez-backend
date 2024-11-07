"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
var EventType;
(function (EventType) {
    EventType["RequestShareCode"] = "EVENT_REQUEST_SHARE_CODE";
    EventType["RequestClientId"] = "EVENT_REQUEST_CLIENT_ID";
    EventType["SendOfferToClient"] = "EVENT_OFFER";
    EventType["SendAnswerToHost"] = "EVENT_ANSWER";
    EventType["IceCandidate"] = "EVENT_ICE_CANDIDATE";
    EventType["RequestHostToSendOffer"] = "EVENT_REQUEST_HOST_TO_SEND_OFFER";
    EventType["RequestNearByShareCode"] = "EVENT_REQUEST_NEAR_BY_SHARE_CODE";
})(EventType || (EventType = {}));
const wss = new ws_1.WebSocketServer({ port: 8080 });
const sessions = {};
const store = new Map();
wss.on("connection", (ws) => {
    console.log("New client connected");
    ws.on("message", (message) => {
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
function handleShareCodeRequest(ws, msg) {
    const shareCode = generateShareCode();
    sessions[shareCode] = {
        hostWS: ws,
        clients: [],
        fileLength: msg.fileLength,
        fileName: msg.fileName,
    };
    ws.send(JSON.stringify({
        event: EventType.RequestShareCode,
        fileLength: msg.fileLength,
        fileName: msg.fileName,
        shareCode,
    }));
    console.log("Created session:", shareCode);
}
function genrateClientIdRequest(ws, msg) {
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
    ws.send(JSON.stringify({
        event: EventType.RequestClientId,
        clientId,
        fileName: session.fileName,
        fileLength: session.fileLength,
        sharedCode: sharedCode,
    }));
    console.log(`Client ${clientId} added to session ${sharedCode}`);
}
function requestHostToSendOffer(ws, msg) {
    console.log("shareCode " + msg.shareCode);
    const sharedCode = msg.shareCode;
    const hostWs = sessions[sharedCode].hostWS;
    hostWs.send(JSON.stringify({
        event: EventType.RequestHostToSendOffer,
        clientId: msg.clientId,
        shareCode: msg.shareCode,
    }));
}
function SendOfferToClient(ws, msg) {
    const sharedCode = msg.shareCode;
    const clientId = msg.clientId;
    const session = sessions[sharedCode];
    if (!session || session.hostWS !== ws) {
        console.log("Host not fount", sharedCode);
        ws.send(JSON.stringify({
            event: "NOT_A_HOST",
        }));
        return;
    }
    const clientWs = session.clients.find((client) => client.clientId === clientId);
    if (!clientWs) {
        console.log("Client not fount");
        JSON.stringify({
            event: "NO_CLIENT_FOUND",
        });
        return;
    }
    clientWs.clientWS.send(JSON.stringify({
        event: EventType.SendOfferToClient,
        offer: msg.offer,
        sharedCode,
        clientId,
    }));
}
function SendAnswerToHost(msg) {
    const sharedCode = msg.shareCode;
    const clientId = msg.clientId;
    const session = sessions[sharedCode];
    console.log("Inside SendAnswerToHost", sharedCode);
    session.hostWS.send(JSON.stringify({
        event: EventType.SendAnswerToHost,
        answer: msg.answer,
        sharedCode,
        clientId,
    }));
}
function ExchangeIceCandidate(ws, msg) {
    const session = sessions[msg.shareCode];
    if (!session) {
        ws.send(JSON.stringify({
            event: "ERROR",
            message: "Invalid share code",
        }));
        return;
    }
    console.log("Client ID from massage", msg.from);
    const clientWs = session.clients.find((client) => client.clientId === msg.clientId);
    if (ws === session.hostWS) {
        if (clientWs === null || clientWs === void 0 ? void 0 : clientWs.clientWS) {
            clientWs.clientWS.send(JSON.stringify({
                event: EventType.IceCandidate,
                candidate: msg.candidate,
                clientId: msg.clientId,
                shareCode: msg.shareCode,
            }));
        }
    }
    else if ((clientWs === null || clientWs === void 0 ? void 0 : clientWs.clientWS) === ws) {
        console.log("Inside IceCandidate");
        session.hostWS.send(JSON.stringify({
            event: EventType.IceCandidate,
            candidate: msg.candidate,
            clientId: msg.clientId,
            shareCode: msg.shareCode,
        }));
    }
    else {
        ws.send(JSON.stringify({
            event: "ERROR",
            message: "Invalid client",
        }));
    }
}
function generateNearByShareCode(ws, msg) {
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
    }
    else {
        nearByShareCode = generateFourDigitCode();
        store.set(nearByShareCode, sharedCode);
    }
    console.log("updated shared Code in session", nearByShareCode);
    session.hostWS.send(JSON.stringify({
        event: EventType.RequestNearByShareCode,
        nearByShareCode,
    }));
}
// Helper function to generate a random share code
function generateShareCode() {
    return Math.random().toString(36).substr(2, 10);
}
// Helper function to generate a unique origin ID for clients
function generateUniqueOrigin() {
    return Math.random().toString(36).substr(2, 10);
}
function generateFourDigitCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}
function addKeyValue(key, value) {
    if (!store.has(key)) {
        store.set(key, value);
    }
    else {
        console.log(`Duplicate key detected: ${key}. Value not added.`);
    }
}
console.log("WebSocket signaling server is running on ws://localhost:8080");
