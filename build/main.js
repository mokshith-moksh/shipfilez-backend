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
})(EventType || (EventType = {}));
const wss = new ws_1.WebSocketServer({ port: 8080 });
const sessions = {};
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
            default:
                console.log("Unknown event:", msg.event);
        }
    });
    ws.on("close", () => {
        console.log("Client disconnected");
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
    const session = sessions[msg.shareCode];
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
        shareCode: msg.shareCode,
    }));
    console.log(`Client ${clientId} added to session ${msg.shareCode}`);
}
function requestHostToSendOffer(ws, msg) {
    console.log("shareCode " + msg.shareCode);
    const hostWs = sessions[msg.shareCode].hostWS;
    hostWs.send(JSON.stringify({
        event: EventType.RequestHostToSendOffer,
        clientId: msg.clientId,
        shareCode: msg.shareCode,
    }));
}
function SendOfferToClient(ws, msg) {
    console.log("reached to send offer to client");
    // sharecode is coming null;
    console.log(msg);
    const shareCode = msg.shareCode;
    const clientId = msg.clientId;
    const session = sessions[shareCode];
    if (!session || session.hostWS !== ws) {
        console.log("Host not fount", shareCode);
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
        shareCode,
        clientId,
    }));
}
function SendAnswerToHost(msg) {
    const shareCode = msg.shareCode;
    const clientId = msg.clientId;
    const session = sessions[shareCode];
    session.hostWS.send(JSON.stringify({
        event: EventType.SendAnswerToHost,
        answer: msg.answer,
        shareCode,
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
    const clientWs = session.clients.find((client) => client.clientId === msg.clientId);
    if (ws === session.hostWS) {
        if (clientWs === null || clientWs === void 0 ? void 0 : clientWs.clientWS) {
            clientWs.clientWS.send(JSON.stringify({
                event: EventType.IceCandidate,
                candidate: msg.candidate,
            }));
        }
    }
    else if ((clientWs === null || clientWs === void 0 ? void 0 : clientWs.clientWS) === ws) {
        session.hostWS.send(JSON.stringify({
            event: EventType.IceCandidate,
            candidate: msg.candidate,
        }));
    }
    else {
        ws.send(JSON.stringify({
            event: "ERROR",
            message: "Invalid client",
        }));
    }
}
// Helper function to generate a random share code
function generateShareCode() {
    return Math.random().toString(36).substr(2, 10);
}
// Helper function to generate a unique origin ID for clients
function generateUniqueOrigin() {
    return Math.random().toString(36).substr(2, 10);
}
console.log("WebSocket signaling server is running on ws://localhost:8080");
