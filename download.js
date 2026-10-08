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

if (isStandalone()) {
  installButton.textContent = "✓ EducaGrana já está instalado";
  installButton.disabled = true;
  setInstallMessage("Você já está usando o app instalado no seu dispositivo.");
} else if (isIosDevice()) {
  setInstallMessage("No iPhone ou iPad: toque em Compartilhar no Safari e depois em “Adicionar à Tela de Início”.");
} else if (!window.isSecureContext && location.hostname !== "localhost") {
  installButton.disabled = true;
  setInstallMessage("A instalação exige que o site seja publicado em HTTPS.");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.disabled = false;
  installButton.textContent = "↓  Instalar EducaGrana";
  setInstallMessage("Pronto para instalar. Toque no botão e confirme no seu dispositivo.");
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
      setInstallMessage("Instalação confirmada. Procure o EducaGrana na tela inicial do seu dispositivo.");
    } else {
      setInstallMessage("Sem problema. Você pode instalar depois pelo menu do navegador.");
    }
    return;
  }
  helpSection.scrollIntoView({ behavior: "smooth", block: "start" });
  setInstallMessage(isIosDevice()
    ? "No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”."
    : "Siga as instruções para seu dispositivo abaixo para adicionar o app à tela inicial.");
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.textContent = "✓ EducaGrana instalado";
  installButton.disabled = true;
  setInstallMessage("O EducaGrana foi instalado com sucesso.");
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch((error) => console.error("Falha ao preparar o app para uso offline.", error));
  });
}
