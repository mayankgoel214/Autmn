// Types
export type {
  WhatsAppWebhookBody,
  WhatsAppWebhookEntry,
  WhatsAppWebhookChange,
  WhatsAppWebhookValue,
  WhatsAppContact,
  WhatsAppMessage,
  TextMessage,
  ImageMessage,
  AudioMessage,
  VideoMessage,
  DocumentMessage,
  StickerMessage,
  LocationMessage,
  ContactsMessage,
  InteractiveMessage,
  ButtonReply,
  ListReply,
  UnknownMessage,
  WhatsAppStatus,
  WhatsAppStatusValue,
  WhatsAppError,
  SendTextPayload,
  SendImagePayload,
  SendVideoPayload,
  SendDocumentPayload,
  SendAudioPayload,
  SendButtonsPayload,
  SendListPayload,
  SendCtaUrlPayload,
  SendFlowPayload,
  SendTemplatePayload,
} from "./types.js";

// Phase 9 — Flow JSON builders + response parsers
export {
  StylePickerFlow,
  buildStylePickerFlowJson,
  parseStylePickerFlowResponse,
  type StylePickerFlowResponse,
} from "./flows.js";

export type {
  TemplateComponent,
  TemplateParameter,
  MarkAsReadPayload,
  SendMessageResponse,
} from "./types.js";

// Signature verification
export { verifyWebhookSignature } from "./signature.js";

// Webhook parsing
export type { ExtractedMessage, ExtractedStatus, MessageType } from "./webhook.js";
export { extractMessage, extractStatus, getMessageType } from "./webhook.js";

// API client
export type { WhatsAppClientConfig } from "./client.js";
export { WhatsAppClient, WhatsAppApiError } from "./client.js";

// Media download
export type { DownloadedMedia } from "./media.js";
export { downloadMedia, WhatsAppMediaError } from "./media.js";
