type RequestId = number;

interface ChannelState {
  current: RequestId;
  cancelled: Set<RequestId>;
}

export class RequestLifecycle {
  private channels = new Map<string, ChannelState>();
  private nextId = 1;

  start(channel: string): RequestId {
    const id = this.nextId++;
    const state = this.channels.get(channel) || { current: 0, cancelled: new Set() };
    state.current = id;
    this.channels.set(channel, state);
    return id;
  }

  isCurrent(channel: string, id: RequestId): boolean {
    const state = this.channels.get(channel);
    if (!state) return false;
    if (state.cancelled.has(id)) return false;
    return state.current === id;
  }

  finish(channel: string, id: RequestId): boolean {
    const state = this.channels.get(channel);
    if (!state || state.current !== id || state.cancelled.has(id)) return false;
    state.current = 0;
    return true;
  }

  cancel(channel: string, id: RequestId): void {
    const state = this.channels.get(channel);
    if (!state) return;
    state.cancelled.add(id);
    if (state.current === id) state.current = 0;
  }

  cancelChannel(channel: string): void {
    const state = this.channels.get(channel);
    if (!state) return;
    state.cancelled.add(state.current);
    state.current = 0;
  }
}
