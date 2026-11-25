/// <reference types="vite/client" />

declare module "@novnc/novnc" {
  export default class RFB {
    constructor(
      target: HTMLElement,
      url: string,
      options?: {
        wsProtocols?: string[];
        credentials?: { password?: string; username?: string; target?: string };
      },
    );
    scaleViewport: boolean;
    resizeSession: boolean;
    focusOnClick: boolean;
    viewOnly: boolean;
    disconnect(): void;
    sendCtrlAltDel(): void;
    sendCredentials(credentials: {
      password?: string;
      username?: string;
      target?: string;
    }): void;
    addEventListener(type: string, listener: (e: CustomEvent) => void): void;
  }
}
