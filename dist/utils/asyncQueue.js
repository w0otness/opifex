import { nextTick } from "./nextTick.js";
export class AsyncQueue {
    queue = [];
    maxQueueLength = Infinity;
    nextResolve = (_value) => { };
    nextReject = (_reason) => { };
    done = false;
    hasNext = false;
    constructor(maxQueueLength) {
        if (maxQueueLength) {
            this.maxQueueLength = maxQueueLength;
        }
    }
    async next() {
        await nextTick();
        if (this.done && this.queue.length === 0) {
            return Promise.reject("Closed");
        }
        return new Promise((resolve, reject) => {
            if (this.queue.length > 0) {
                const item = this.queue.shift();
                if (item) {
                    return resolve(item);
                }
            }
            this.nextResolve = resolve;
            this.nextReject = reject;
            this.hasNext = true;
        });
    }
    close(reason = "closed") {
        this.done = true;
        if (this.hasNext) {
            this.nextReject(reason);
        }
    }
    async *[Symbol.asyncIterator]() {
        while (true) {
            yield this.next();
        }
    }
    push(item) {
        if (this.hasNext) {
            this.nextResolve(item);
            this.hasNext = false;
            return;
        }
        if (this.queue.length > this.maxQueueLength) {
            this.queue.shift();
        }
        this.queue.push(item);
    }
    get isDone() {
        return this.done;
    }
}
