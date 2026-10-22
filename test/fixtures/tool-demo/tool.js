/* Công cụ THỬ (chỉ dùng trong test). writeEarly: cố tình gửi lệnh khi đang đọc để thử cờ readBeforeWrite. */
ADXTools.register({
  id: 'demo',
  name: 'Thử',
  readBeforeWrite: true,
  config: { writeEarly: false, noExpect: false },
  log: {
    title: 'Nhật ký thử',
    file: 'thu',
    results: {
      act: { text: 'ĐÃ LÀM', label: 'Đã làm', cls: 'ok' },
      unknown: { text: 'KIỂM TRA TAY', label: 'Kiểm tra tay', cls: 'warn' },
    },
  },
  counts: () => ({ act: 0 }),
  async run(api) {
    const cfg = api.toolConfig;
    const todo = [];
    api.state.step = 'read';
    for await (const { v, pos, total } of api.readItems('-1', api.config.runPageSize, api.config.readAhead)) {
      const d = ADXModel.info(v);
      const p = ADXRules.demo.planOf(v, d, cfg.noExpect);
      if (!p.reqs.length) continue;
      if (cfg.writeEarly) await api.execute({ d, plan: p, stt: '', result: 'ĐÃ LÀM' });
      todo.push({ d, p, stt: `${pos}/${total}` });
    }
    api.state.step = 'write';
    await api.pool(todo, api.config.writeConcurrency, async ({ d, p, stt }) => {
      await api.execute({ d, plan: p, stt, result: 'ĐÃ LÀM' });
      api.state.counts.act++;
    });
    return `Xong – ${api.state.counts.act} đơn`;
  },
  summary: (s) => `Đã dừng – ${s.counts.act} đơn`,
  panel: { start: 'Chạy thử', confirm: 'Chạy thử?', progress: () => ({ text: '', pct: 0 }), counters: () => [] },
});
