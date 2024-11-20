export interface typeNearByShareCode {
  event: EventType.RequestNearByShareCode;
  shareCode: string;
}
export interface typeShareCode {
  event: EventType.RequestShareCode;
  fileName: string[];
  fileLength: number;
}
export interface typeGenClientId {
  event: EventType.RequestClientId;
  shareCode: string;
}
export interface typeRequestHostToSendOfferMsg {
  event: EventType.RequestHostToSendOffer;
  shareCode: string;
  clientId: string;
}

export interface typeSendOfferToClient {
  event: EventType.SendOfferToClient;
  shareCode: string;
  clientId: string;
  offer: any;
}
export interface typeSendAnswerToHost {
  event: EventType.SendAnswerToHost;
  shareCode: string;
  clientId: string;
  answer: any;
}
export interface typeExchangeIceCandidate {
  event: EventType.IceCandidate;
  shareCode: string;
  clientId: string;
  candidate: any;
  from: string;
}
export enum EventType {
  RequestShareCode = "EVENT_REQUEST_SHARE_CODE",
  RequestClientId = "EVENT_REQUEST_CLIENT_ID",
  SendOfferToClient = "EVENT_OFFER",
  SendAnswerToHost = "EVENT_ANSWER",
  IceCandidate = "EVENT_ICE_CANDIDATE",
  RequestHostToSendOffer = "EVENT_REQUEST_HOST_TO_SEND_OFFER",
  RequestNearByShareCode = "EVENT_REQUEST_NEAR_BY_SHARE_CODE",
}
