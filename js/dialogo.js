// O evento "close" do <dialog> não chega em todos os navegadores: no Chrome 152 ele
// deixou de disparar, e nos Safari antigos é o evento "toggle" que não existe.
// prepararDialogo() faz o <dialog> avisar o fechamento pelo evento FECHADO, uma única
// vez por fechamento, venha ele do nosso .close(), do Esc, do toque fora ou do Voltar.

export const FECHADO = 'dialogo-fechado';

export function prepararDialogo(dialogo) {
  if (!dialogo || dialogo.dataset.preparado) return dialogo;
  dialogo.dataset.preparado = '1';

  let aberto = dialogo.open;
  const avisar = () => {
    if (dialogo.open || !aberto) return;
    aberto = false;
    dialogo.dispatchEvent(new Event(FECHADO));
  };

  const { showModal, show, close } = HTMLDialogElement.prototype;
  dialogo.showModal = function (...args) {
    showModal.apply(this, args);
    aberto = true;
  };
  dialogo.show = function (...args) {
    show.apply(this, args);
    aberto = true;
  };
  dialogo.close = function (...args) {
    close.apply(this, args);
    avisar();
  };

  dialogo.addEventListener('close', avisar);
  dialogo.addEventListener('toggle', (evento) => {
    if (evento.newState === 'open') aberto = dialogo.open;
    else avisar();
  });
  return dialogo;
}
