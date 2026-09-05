import assert from "node:assert/strict";
import test from "node:test";
import {
  AudioAutomation,
  getAudioGainExponent,
  getAudioGainMultiplier,
} from "../audio-automation.mjs";

// Deliberately stale .value, like a browser read outside the render quantum.
class Param {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.events.push({ type: "set", value, time }); }
  linearRampToValueAtTime(value, time) { this.events.push({ type: "ramp", value, time }); }
  setTargetAtTime(value, time, constant) { this.events.push({ type: "target", value, time, constant }); }
  cancelScheduledValues(time) { this.events = this.events.filter((event) => event.time < time); }

  sample(time) {
    let value = 0;
    let start = 0;
    let target;
    for (const event of this.events) {
      if (event.time > time) {
        if (event.type === "ramp") {
          return value + (event.value - value) * (time - start) / (event.time - start);
        }
        break;
      }
      if (target) value = target.value + (value - target.value) * Math.exp(-(event.time - start) / target.constant);
      if (event.type !== "target") value = event.value;
      target = event.type === "target" ? event : undefined;
      start = event.time;
    }
    return target ? target.value + (value - target.value) * Math.exp(-(time - start) / target.constant) : value;
  }
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const envelope = [{ value: 1, time: 0.028 }, { value: 0, time: 0.378 }];

for (const time of [0.014, 0.028, 0.15, 0.378, 0.5]) {
  test(`fallback retrigger preserves attack/release at ${time}s`, () => {
    const automation = new AudioAutomation();
    const param = new Param();
    automation.ramp(param, 0, envelope);
    const before = param.sample(time - 0.001);
    const current = param.sample(time);
    automation.ramp(param, time, [{ value: 0.7, time: time + 0.028 }, { value: 0, time: time + 0.378 }]);
    close(param.sample(time - 0.001), before);
    close(param.sample(time), current);
    close(automation.valueAt(param, time), current);
    close(param.sample(time + 0.378), 0);
  });
}

test("continuous-to-envelope transition holds the exponential value", () => {
  const automation = new AudioAutomation();
  const param = new Param();
  automation.target(param, 1, 0, 0.045);
  automation.ramp(param, 0.045, [{ value: 0.5, time: 0.073 }, { value: 0, time: 0.2 }]);
  close(param.sample(0.045), 1 - Math.exp(-1));
  close(param.sample(0.02), 1 - Math.exp(-0.02 / 0.045));
});

test("envelope-to-continuous transition does not erase the release slope", () => {
  const automation = new AudioAutomation();
  const param = new Param();
  automation.ramp(param, 0, envelope);
  const current = param.sample(0.1);
  automation.target(param, 0.2, 0.1, 0.045);
  close(param.sample(0.1), current);
  close(param.sample(0.145), 0.2 + (current - 0.2) * Math.exp(-1));
});

test("unchanged targets do not restart automation each video frame", () => {
  const automation = new AudioAutomation();
  const param = new Param();
  automation.target(param, 1, 0, 0.045);
  const count = param.events.length;
  for (let i = 1; i <= 600; i++) automation.target(param, 1, i / 60, 0.045);
  assert.equal(param.events.length, count);
  close(automation.valueAt(param, 0.045), 1 - Math.exp(-1));
});

test("reset clears the tracked envelope for the next sound start", () => {
  const automation = new AudioAutomation();
  const param = new Param();
  automation.ramp(param, 0, envelope);
  automation.reset(param, 0, 0.1);
  automation.ramp(param, 0.2, [{ value: 1, time: 0.228 }]);
  close(param.sample(0.2), 0);
  close(param.sample(0.214), 0.5);
});

test("native hold is used when available without reading stale .value", () => {
  const automation = new AudioAutomation();
  const param = new Param();
  const holds = [];
  param.cancelAndHoldAtTime = (time) => { holds.push(time); };
  automation.ramp(param, 0, envelope);
  automation.target(param, 0.2, 0.014, 0.045);
  assert.deepEqual(holds, [0, 0.014]);
  close(automation.valueAt(param, 0.014), 0.5);
});

test("gain control maps zero to current level and maximum to six times the level", () => {
  close(getAudioGainMultiplier(0), 1);
  close(getAudioGainMultiplier(50), 3.5);
  close(getAudioGainMultiplier(100), 6);
});

test("curve control maps minimum, center and maximum to the requested exponents", () => {
  close(getAudioGainExponent(-100), 0.65);
  close(getAudioGainExponent(0), 1);
  close(getAudioGainExponent(100), 1.35);
});
