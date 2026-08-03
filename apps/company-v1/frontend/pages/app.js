const statusElement = document.querySelector('#edition-status');
const { editionId, phase } = document.body.dataset;

if (statusElement) {
  statusElement.textContent = `${editionId} — ${phase}`;
}
