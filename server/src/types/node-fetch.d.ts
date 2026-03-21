declare module 'node-fetch' {
  import { RequestInit, Response } from 'node-fetch'
  export default function fetch(url: string, init?: RequestInit): Promise<Response>
}
