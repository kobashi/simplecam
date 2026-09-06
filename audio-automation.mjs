// Track intrinsic parameter values independently of browser AudioParam.value.
export class AudioAutomation {
  constructor() {
    this.schedules = new WeakMap();
  }

  valueAt(param, time) {
    const schedule = this.schedules.get(param);
    if (!schedule) return param.value;
    let { value, start } = schedule;
    if (schedule.target !== undefined) {
      return schedule.target + (value - schedule.target)
        * Math.exp(-Math.max(0, time - start) / schedule.constant);
    }
    for (const point of schedule.points) {
      if (time < point.time) {
        const progress = Math.max(0, (time - start) / (point.time - start));
        return value + (point.value - value) * progress;
      }
      value = point.value;
      start = point.time;
    }
    return value;
  }

  hold(param, time) {
    const schedule = this.schedules.get(param);
    const value = this.valueAt(param, time);
    if (typeof param.cancelAndHoldAtTime === "function") {
      param.cancelAndHoldAtTime(time);
    } else {
      param.cancelScheduledValues(time);
      // Cancelling a ramp's endpoint also removes its preceding slope.
      // Recreate that slope up to the hold time before starting a new curve.
      if (schedule?.points?.some((point) => point.time >= time) && time > schedule.start) {
        param.linearRampToValueAtTime(value, time);
      }
    }
    param.setValueAtTime(value, time);
    this.schedules.set(param, { start: time, value, points: [] });
    return value;
  }

  target(param, value, time, constant) {
    const current = this.schedules.get(param);
    if (current?.target === value && current.constant === constant) return;
    const initial = this.hold(param, time);
    param.setTargetAtTime(value, time, constant);
    this.schedules.set(param, { start: time, value: initial, target: value, constant });
  }

  ramp(param, time, points) {
    const value = this.hold(param, time);
    for (const point of points) {
      param.linearRampToValueAtTime(point.value, point.time);
    }
    this.schedules.set(param, { start: time, value, points });
  }

  reset(param, value, time) {
    param.cancelScheduledValues(time);
    param.setValueAtTime(value, time);
    this.schedules.set(param, { start: time, value, points: [] });
  }
}

export function getAudioGainMultiplier(amount) {
  const normalized = Math.max(0, Math.min(100, amount)) / 100;
  return 1 + (normalized * 9);
}

export function getAudioGainExponent(amount) {
  const normalized = Math.max(-100, Math.min(100, amount)) / 100;
  return 1 + (normalized * 0.35);
}

export function getAudioFmDepth(saturation, dominance, index, dominancePower = 1) {
  const safeSaturation = Math.max(0, Math.min(1, saturation));
  const safeDominance = Math.max(0, Math.min(1, dominance));
  return safeSaturation * (safeDominance ** dominancePower) * Math.max(0, index);
}

export function getAudioFmLfoDepth(frequency, fmDepth, amount = 0.28) {
  return Math.max(0, frequency) * Math.max(0, fmDepth) * Math.max(0, amount);
}

export function limitAudioPolyphony(frame, maxVoices) {
  const voiceLimit = Math.max(1, Math.min(12, Math.round(maxVoices)));
  const rankedNotes = frame.notes
    .map((note, index) => ({
      index,
      score: note.active ? note.dominance * (0.25 + (note.intensity * 0.75)) : 0,
    }))
    .filter((note) => note.score > 0)
    .sort((a, b) => b.score - a.score);
  const activeIndexes = new Set(rankedNotes.slice(0, voiceLimit).map((note) => note.index));

  return {
    ...frame,
    notes: frame.notes.map((note, index) => ({
      ...note,
      active: note.active && activeIndexes.has(index),
    })),
  };
}
