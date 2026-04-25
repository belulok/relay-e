// Silence the application logger during tests. Real assertions on log lines
// should mock the logger directly; this just keeps `npm test` output readable.
process.env.LOG_LEVEL = "silent";
