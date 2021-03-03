/// <reference types="node" />

import {EventEmitter} from 'events';
import { SRTResult, SRTSockOpt } from '../src/srt-api-enums';
import { SRTSockOptValue } from './srt-api';
import { AsyncSRT } from './srt-api-async';

export interface SRTSocketConnection {
  read(): Promise<Uint8Array | SRTResult.SRT_ERROR | null>;
  write(chunk: Buffer | Uint8Array): Promise<SRTResult>;
  getReaderWriter(): AsyncReaderWriter;
}

export class AsyncReaderWriter {
  constructor(asyncSrt: AsyncSRT, socketFd: number);

  writeChunks(buffer: Uint8Array | Buffer, mtuSize: number,
    writesPerTick: number): Promise<void>;

  readChunks(minBytesRead: number,
    readBufSize: number,
    onRead: (buf: Uint8Array) => void,
    onError: (readResult: (SRTResult.SRT_ERROR | null)) => void): Promise<Uint8Array[]>;
}

export class SRTSocketAsync extends EventEmitter {
  constructor(port: number, address?: string);

  readonly address: string;
  readonly port: number;
  readonly socket: number;

  create(): Promise<SRTServer>;
  open(): Promise<SRTServer>;
  dispose(): Promise<SRTResult>;

  setSocketFlags(opts: SRTSockOpt[], values: SRTSockOptValue[]): Promise<SRTResult[]>;
}

export class SRTClientConnection extends SRTSocketAsync implements SRTSocketConnection {
  getReaderWriter(): AsyncReaderWriter;
  read(): Promise<Uint8Array | SRTResult.SRT_ERROR>;
  write(chunk: Buffer | Uint8Array): Promise<SRTResult>;
}

export class SRTServer extends SRTSocketAsync {

  static create(port: number, address?: string,
    epollPeriodMs?: number): Promise<SRTServer>;

  constructor(port: number, address?: string, epollPeriodMs?: number);

  readonly epid: number;

  epollPeriodMs: number;

  getConnectionByHandle(fd: number);
  getAllConnections(): SRTServerConnection[];
}

export class SRTServerConnection extends EventEmitter implements SRTSocketConnection {
  readonly fd: number;
  readonly gotFirstData: boolean;

  getReaderWriter(): AsyncReaderWriter;
  read(): Promise<Uint8Array | SRTResult.SRT_ERROR | null>;
  write(chunk: Buffer | Uint8Array): Promise<SRTResult>;

  close(): Promise<SRTResult | null>;
  isClosed(): boolean;

  onData(): void;
}



