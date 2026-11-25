// AudioWorkletProcessor para capturar áudio e converter em PCM 16 kHz Int16 (~80 ms por pacote)
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const targetRate = (options && options.processorOptions && options.processorOptions.targetSampleRate) || 16000;
    this.targetSampleRate = targetRate;
    this.chunkSize = Math.round(targetRate * 0.08); // ~80 ms (1280 amostras a 16 kHz)
    this.ratio = sampleRate / this.targetSampleRate;
    this.accum = 0;
    this.outBuf = new Int16Array(this.chunkSize);
    this.outIdx = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const ch0 = input[0];
    const ch1 = input.length > 1 ? input[1] : null;
    const len = ch0.length;

    while (this.accum < len) {
      const i = Math.floor(this.accum);
      let sample = ch0[i];
      if (ch1) sample = (sample + ch1[i]) * 0.5;
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;

      this.outBuf[this.outIdx++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.accum += this.ratio;

      if (this.outIdx >= this.chunkSize) {
        const copy = this.outBuf.slice(0);
        this.port.postMessage(copy.buffer, [copy.buffer]);
        this.outIdx = 0;
      }
    }

    this.accum -= len;
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
