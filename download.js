let installPrompt = null;

const installButton = document.querySelector("#install-button");
const installStatus = document.querySelector("#install-status");
const helpSection = document.querySelector("#install-help");

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function setInstallMessage(message) {
  installStatus.textContent = message;
}

function setInstallButtonLabel(message) {
  installButton.querySelector(".install-label").textContent = message;
}

if (isStandalone()) {
  setInstallButtonLabel("\u2713 EducaGrana j\u00E1 est\u00E1 instalado");
  installButton.disabled = true;
  setInstallMessage("Voc\u00EA j\u00E1 est\u00E1 usando o app instalado no seu dispositivo.");
} else if (isIosDevice()) {
  setInstallMessage("No iPhone ou iPad: toque em Compartilhar no Safari e depois em \u201CAdicionar \u00E0 Tela de In\u00EDcio\u201D.");
} else if (!window.isSecureContext && location.hostname !== "localhost") {
  installButton.disabled = true;
  setInstallMessage("A instala\u00E7\u00E3o exige que o site seja publicado em HTTPS.");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.disabled = false;
  setInstallButtonLabel("Instalar EducaGrana");
  setInstallMessage("Pronto para instalar. Toque no bot\u00E3o e confirme no seu dispositivo.");
});

installButton.addEventListener("click", async () => {
  if (isStandalone()) return;
  if (installPrompt) {
    installButton.disabled = true;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    installButton.disabled = false;
    if (choice.outcome === "accepted") {
      setInstallMessage("Instala\u00E7\u00E3o confirmada. Procure o EducaGrana na tela inicial do seu dispositivo.");
    } else {
      setInstallMessage("Sem problema. Voc\u00EA pode instalar depois pelo menu do navegador.");
    }
    return;
  }
  helpSection.scrollIntoView({ behavior: "smooth", block: "start" });
  setInstallMessage(isIosDevice()
    ? "No Safari, toque em Compartilhar e escolha \u201CAdicionar \u00E0 Tela de In\u00EDcio\u201D."
    : "Siga as instru\u00E7\u00F5es para seu dispositivo abaixo para adicionar o app \u00E0 tela inicial.");
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  setInstallButtonLabel("\u2713 EducaGrana instalado");
  installButton.disabled = true;
  setInstallMessage("O EducaGrana foi instalado com sucesso.");
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch((error) => console.error("Falha ao preparar o app para uso offline.", error));
  });
}
