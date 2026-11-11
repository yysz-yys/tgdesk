export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  phone?: string;
  restricted?: boolean;
  restriction?: string;
  displayName: string;
  initials: string;
  color: string;
}

export type AuthEventState =
  | "idle"
  | "starting"
  | "qr"
  | "code"
  | "password"
  | "verifying"
  | "success"
  | "error"
  | "cancelled";

export interface AuthEvent {
  state: AuthEventState;
  qrUrl?: string;
  user?: AuthUser;
  error?: string;
}

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type Accent = "blue" | "purple" | "green" | "orange" | "pink";

export type ChatKind = "private" | "group" | "channel";

export interface Chat {
  id: string;
  title: string;
  kind: ChatKind;
  username?: string;
  preview: string;
  time: string;
  unread?: number;
  pinned?: boolean;
  muted?: boolean;
  online?: boolean;
  verified?: boolean;
  members?: string;
  color: string;
  initials: string;
}

export type MediaKind = "photo" | "video" | "file" | "audio";

export interface MessageMedia {
  kind: MediaKind;
  name: string;
  size?: string;
  ext?: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mime?: string;
  color?: string;
}

export interface Message {
  id: number;
  chatId: string;
  out: boolean;
  sender?: string;
  text?: string;
  time: string;
  date: string;
  checks?: "sent" | "read";
  forwarded?: boolean;
  forwardedFrom?: string;
  forwardedDate?: number;
  media?: MessageMedia;
  tail?: boolean;
}

export type TaskStatus = "active" | "queued" | "paused" | "done" | "failed";

export interface DownloadTask {
  id: string;
  name: string;
  chat: string;
  size: string;
  progress: number;
  speed?: string;
  eta?: string;
  status: TaskStatus;
  ext: string;
  color: string;
  error?: string;
  path?: string;
}

export interface DownloadEvent {
  task?: DownloadTask;
  removed?: boolean;
}
