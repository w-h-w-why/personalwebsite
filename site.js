/**
 * 渐进增强：复制邮箱及日期更新独立于静态导航与正文。
 * JS 不可用时仍能通过页脚/联系页邮件链接联系；复制失败保留可选中文本，避免误报成功。
 */
(() => {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date());
  const [year, month] = date.split('-').map(Number);
  document.querySelectorAll('[data-current-year]').forEach(element => { element.textContent = String(year); });
  document.querySelectorAll('[data-experience-start]').forEach(element => {
    const [startYear, startMonth] = element.dataset.experienceStart.split('-').map(Number);
    if (!Number.isInteger(startYear) || startMonth < 1 || startMonth > 12) return;
    // 起始日期只记录到月，按日历月计算近似任职时长，不暗示已知具体入职日。
    const months = Math.max(0, (year - startYear) * 12 + month - startMonth);
    element.textContent = [months >= 12 ? `${Math.floor(months / 12)} 年` : '', months % 12 || months === 0 ? `${months % 12} 个月` : ''].filter(Boolean).join(' ');
  });

  const button = document.querySelector('[data-copy-email]');
  const status = document.querySelector('#copy-status');
  if (!button || !status) return;
  button.hidden = false;

  /**
   * 在用户点击期间尝试写入剪贴板，并通过可读状态反馈结果。
   * 无参数，返回 Promise<void>；拒绝权限/缺少 API 时不打开邮件客户端，
   * 而是显示可手动复制的邮箱。处理期间禁用按钮，防止多个异步请求交错。
   */
  async function copyEmail() {
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(button.dataset.copyEmail);
      button.textContent = '已复制';
      status.textContent = '邮箱已复制，可直接粘贴。';
    } catch {
      button.textContent = '复制邮箱';
      status.textContent = `无法自动复制，请选中邮箱手动复制：${button.dataset.copyEmail}`;
    } finally {
      status.hidden = false;
      button.disabled = false;
    }
  }
  button.addEventListener('click', copyEmail);
})();
