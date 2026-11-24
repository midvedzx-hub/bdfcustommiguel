import Peer, { type DataConnection } from "peerjs";
import type { SyncMessage } from "@/types";

type Handler = (msg: SyncMessage) => void;
type StatusHandler = (status: string) => void;

export class MultiplayerManager {
  peer: Peer | null = null;
  conn: DataConnection | null = null;
  onMessage: Handler | null = null;
  onStatus: StatusHandler | null = null;
  onClose: (() => void) | null = null; // การเชื่อมต่อกับเพื่อนหลุด (เน็ตหลุด / เพื่อนปิดแท็บ)
  roomId: string = "";

  generateRoomId(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let id = "";
    for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  setStatus(status: string) {
    this.onStatus?.(status);
  }

  // reuse = เปิดห้องเดิมซ้ำ (หลังรีเฟรช/ปิดแท็บ): เซิร์ฟเวอร์อาจยังจำรหัสเดิมอยู่สักครู่ จึงลองใหม่อัตโนมัติ
  async hostRoom(roomId: string, reuse = false): Promise<void> {
    const tries = reuse ? 8 : 1;
    let lastErr: unknown = null;
    for (let i = 0; i < tries; i++) {
      try {
        if (i > 0) this.setStatus(`รหัสห้อง ${roomId} ยังถูกจองอยู่ รอสักครู่แล้วลองเปิดห้องเดิมอีกครั้ง (${i}/${tries - 1})...`);
        await this.hostRoomOnce(roomId);
        return;
      } catch (e) {
        lastErr = e;
        if (!(reuse && (e as Error)?.message?.includes("ถูกใช้แล้ว"))) break;
        await new Promise(r => setTimeout(r, 2500));
      }
    }
    throw lastErr;
  }

  private hostRoomOnce(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.peer) { try { this.peer.destroy(); } catch { /* ignore */ } this.peer = null; }
      this.conn = null;
      this.roomId = roomId;
      this.peer = new Peer(`cbf-${roomId}`, { debug: 1 });

      this.peer.on("open", () => {
        this.setStatus("ห้องพร้อมแล้ว ส่งรหัสให้เพื่อน: " + roomId);
        resolve();
      });

      this.peer.on("connection", (conn) => {
        if (this.conn && this.conn.open) { conn.close(); return; } // ห้องเต็ม (ถ้าสายเก่าหลุดแล้ว เพื่อนต่อกลับเข้ามาใหม่ได้)
        this.conn = conn;
        this.setupConnection();
        this.setStatus("เพื่อนเข้าร่วมแล้ว! เชื่อมต่อสำเร็จ");
      });

      this.peer.on("error", (err) => {
        this.setStatus("ข้อผิดพลาด: " + err.message);
        if (err.type === "unavailable-id") {
          reject(new Error("รหัสห้องนี้ถูกใช้แล้ว ลองสร้างใหม่"));
        } else {
          reject(err);
        }
      });
    });
  }

  joinRoom(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.peer) { try { this.peer.destroy(); } catch { /* ignore */ } this.peer = null; }
      this.conn = null;
      this.roomId = roomId;
      const tempId = `cbf-${roomId}-guest-${Math.random().toString(36).slice(2, 8)}`;
      this.peer = new Peer(tempId, { debug: 1 });

      this.peer.on("open", () => {
        this.setStatus("กำลังเชื่อมต่อห้อง " + roomId + "...");
        this.conn = this.peer!.connect(`cbf-${roomId}`, { reliable: true });

        this.conn.on("open", () => {
          this.setupConnection();
          this.setStatus("เชื่อมต่อสำเร็จ! เข้าห้องแล้ว");
          resolve();
        });

        this.conn.on("error", (err) => {
          this.setStatus("ข้อผิดพลาดการเชื่อมต่อ: " + err.message);
          reject(err);
        });
      });

      this.peer.on("error", (err) => {
        this.setStatus("ข้อผิดพลาด: " + err.message);
        reject(err);
      });
    });
  }

  setupConnection() {
    if (!this.conn) return;
    this.conn.on("data", (data) => {
      try {
        const msg = typeof data === "string" ? JSON.parse(data) : data as SyncMessage;
        this.onMessage?.(msg);
      } catch {
        // ignore malformed
      }
    });
    const myConn = this.conn;
    this.conn.on("close", () => {
      if (this.conn !== myConn) return; // สายเก่าที่ถูกแทนที่แล้ว
      this.setStatus("การเชื่อมต่อถูกตัด");
      this.onClose?.();
    });
  }

  send(msg: SyncMessage) {
    if (this.conn && this.conn.open) {
      this.conn.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    if (this.conn) { this.conn.close(); this.conn = null; }
    if (this.peer) { this.peer.destroy(); this.peer = null; }
    this.roomId = "";
  }
}

export const mp = new MultiplayerManager();
