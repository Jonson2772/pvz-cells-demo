const scanForm = document.querySelector("#scanForm");
const scanButton = document.querySelector("#scanButton");
const orderInput = document.querySelector("#orderInput");
const duplicateToggle = document.querySelector("#duplicateToggle");
const printerToggle = document.querySelector("#printerToggle");
const printerBadge = document.querySelector("#printerBadge");
const processState = document.querySelector("#processState");
const labelPreview = document.querySelector("#labelPreview");
const cellCode = document.querySelector("#cellCode");
const labelOrder = document.querySelector("#labelOrder");
const historyBody = document.querySelector("#historyBody");
const resetButton = document.querySelector("#resetButton");

const metricElements = {
  processed: document.querySelector("#processedMetric"),
  printed: document.querySelector("#printedMetric"),
  duplicate: document.querySelector("#duplicateMetric"),
  error: document.querySelector("#errorMetric"),
};

const flowElements = [
  document.querySelector("#flowScan"),
  document.querySelector("#flowDetect"),
  document.querySelector("#flowPrint"),
];

const session = {
  processed: 0,
  printed: 0,
  duplicate: 0,
  error: 0,
  history: [],
  recentOrders: new Map(),
};

const demoCells = ["12-1", "18-2", "24-1", "31-3", "42-2", "57-1", "63-4", "72-1", "84-3"];

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function sanitizeOrder(value) {
  return value.trim().toUpperCase().replace(/[^A-ZА-Я0-9-]/g, "").slice(0, 32);
}

function selectCell(order) {
  let checksum = 0;
  for (const character of order) checksum += character.charCodeAt(0);
  return demoCells[checksum % demoCells.length];
}

function setFlow(activeIndex, isError = false) {
  flowElements.forEach((element, index) => {
    element.classList.toggle("done", index < activeIndex);
    element.classList.toggle("active", index === activeIndex && !isError);
  });
}

function setProcessState(type, title, description) {
  processState.className = `process-state ${type}-state`;
  processState.querySelector("strong").textContent = title;
  processState.querySelector("p").textContent = description;
}

function updateMetrics() {
  Object.entries(metricElements).forEach(([key, element]) => {
    element.textContent = session[key];
  });
}

function formatTime(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function resultMarkup(result) {
  const classes = {
    success: "result-success",
    warning: "result-warning",
    error: "result-error",
  };
  return `<span class="result-tag ${classes[result.type]}">${result.label}</span>`;
}

function renderHistory() {
  if (session.history.length === 0) {
    historyBody.innerHTML = '<tr class="table-empty"><td colspan="4">Операций пока нет. Отсканируйте первый демо-заказ.</td></tr>';
    return;
  }

  historyBody.innerHTML = session.history
    .slice(0, 7)
    .map((item) => `
      <tr>
        <td>${item.time}</td>
        <td><strong>${item.order}</strong></td>
        <td>${item.cell || "-"}</td>
        <td>${resultMarkup(item.result)}</td>
      </tr>
    `)
    .join("");
}

function addHistory(order, cell, result) {
  session.history.unshift({
    time: formatTime(new Date()),
    order,
    cell,
    result,
  });
  renderHistory();
}

function showLabel(order, cell) {
  cellCode.textContent = cell;
  labelOrder.textContent = `Демо-заказ ${order}`;
  labelPreview.classList.remove("label-idle");
  labelPreview.classList.add("label-printing");
  window.setTimeout(() => labelPreview.classList.remove("label-printing"), 260);
}

function isRecentDuplicate(order) {
  const lastScanAt = session.recentOrders.get(order);
  if (!lastScanAt) return false;
  return Date.now() - lastScanAt < 20_000;
}

async function processOrder(rawOrder) {
  const order = sanitizeOrder(rawOrder);
  if (!order) {
    setProcessState("error", "Не удалось прочитать код", "Используйте буквы, цифры и дефис.");
    orderInput.focus();
    return;
  }

  scanButton.disabled = true;
  scanButton.textContent = "Обработка...";
  session.processed += 1;
  updateMetrics();

  setFlow(0);
  setProcessState("loading", "Сканирование принято", `Демо-заказ ${order} передан в обработку.`);
  await wait(320);

  if (duplicateToggle.checked && isRecentDuplicate(order)) {
    session.duplicate += 1;
    updateMetrics();
    setFlow(1, true);
    setProcessState("warning", "Повторная печать заблокирована", "Этот код уже обрабатывался менее 20 секунд назад.");
    addHistory(order, selectCell(order), { type: "warning", label: "Повтор заблокирован" });
    finishProcessing();
    return;
  }

  const cell = selectCell(order);
  setFlow(1);
  setProcessState("loading", `Распознана ячейка ${cell}`, "Локальный агент проверяет готовность демо-принтера.");
  showLabel(order, cell);
  await wait(420);

  if (!printerToggle.checked) {
    session.error += 1;
    updateMetrics();
    setFlow(2, true);
    setProcessState("error", "Печать не выполнена", "Демо-принтер выключен. Включите его и повторите сканирование.");
    addHistory(order, cell, { type: "error", label: "Ошибка принтера" });
    finishProcessing();
    return;
  }

  session.recentOrders.set(order, Date.now());
  session.printed += 1;
  updateMetrics();
  setFlow(2);
  setProcessState("success", `Этикетка ${cell} напечатана`, "Сотрудник может наклеить её и разместить отправление в указанной ячейке.");
  addHistory(order, cell, { type: "success", label: "Напечатано" });
  finishProcessing();
}

function finishProcessing() {
  scanButton.disabled = false;
  scanButton.textContent = "Сканировать";
  orderInput.value = "";
  orderInput.focus();
}

scanForm.addEventListener("submit", (event) => {
  event.preventDefault();
  processOrder(orderInput.value);
});

document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => {
    orderInput.value = button.dataset.sample;
    orderInput.focus();
  });
});

printerToggle.addEventListener("change", () => {
  const ready = printerToggle.checked;
  printerBadge.textContent = ready ? "Принтер готов" : "Принтер выключен";
  printerBadge.className = `state-badge ${ready ? "state-ready" : "state-offline"}`;
});

resetButton.addEventListener("click", () => {
  Object.assign(session, {
    processed: 0,
    printed: 0,
    duplicate: 0,
    error: 0,
    history: [],
    recentOrders: new Map(),
  });
  updateMetrics();
  renderHistory();
  setFlow(-1);
  setProcessState("empty", "Готово к сканированию", "После сканирования здесь появится назначенная ячейка и статус печати.");
  cellCode.textContent = "--";
  labelOrder.textContent = "Ожидание сканирования";
  labelPreview.className = "label-preview label-idle";
  orderInput.focus();
});

orderInput.focus();
