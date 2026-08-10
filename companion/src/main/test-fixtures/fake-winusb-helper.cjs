const readline = require('node:readline');

function report(seed) {
  return Array.from({ length: 64 }, (_, index) => (seed + index) & 0xff);
}

let writeChain = Promise.resolve();

function writeJson(value, chunked = false) {
  const line = `${JSON.stringify(value)}\n`;
  writeChain = writeChain.then(async () => {
    if (!chunked) {
      process.stdout.write(line);
      return;
    }
    const split = Math.max(1, Math.floor(line.length / 2));
    process.stdout.write(line.slice(0, split));
    await new Promise((resolve) => setTimeout(resolve, 5));
    process.stdout.write(line.slice(split));
  });
}

console.error('status: fake winusb helper ready');

const input = readline.createInterface({
  input: process.stdin,
  terminal: false
});

input.on('line', (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    writeJson({ id: 0, ok: false, error: error.message });
    return;
  }

  if (request.op === 'close') {
    writeJson({ id: request.id, ok: true });
    process.exit(0);
  }

  if (request.op === 'get') {
    if (request.reportId === 0xee) {
      process.exit(42);
      return;
    }
    const response = {
      id: request.id,
      ok: true,
      report: report(request.reportId)
    };
    if (request.reportId === 0x11) {
      setTimeout(() => writeJson(response), 25);
      return;
    }
    writeJson(response, request.reportId === 0x12);
    return;
  }

  if (request.op === 'set' || request.op === 'write') {
    const validReport = Array.isArray(request.report) && request.report.length === 64;
    writeJson({
      id: request.id,
      ok: validReport,
      error: validReport ? undefined : 'invalid report'
    });
    return;
  }

  writeJson({ id: request.id, ok: false, error: `unknown op ${request.op}` });
});
