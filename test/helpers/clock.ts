import type { Clock } from "../../src/http.js";

/** A clock that only moves when told to; sleep() moves it instantly. */
export class FakeClock implements Clock {
  time = 0;

  now = (): number => this.time;

  sleep = async (ms: number): Promise<void> => {
    this.time += Math.max(0, ms);
  };

  advance(ms: number): void {
    this.time += ms;
  }
}
