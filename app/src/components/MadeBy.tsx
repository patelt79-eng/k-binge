const MARK = `${import.meta.env.BASE_URL}vimana-labs.png`;

/** "Created by Vimana Labs" credit. The logo is a mask, so it follows the text colour in light and dark. */
export function MadeBy() {
  return (
    <a className="made-by" href="https://www.vimanalabs.co.uk" target="_blank" rel="noopener">
      <span className="made-by-mark" style={{ WebkitMaskImage: `url(${MARK})`, maskImage: `url(${MARK})` }} aria-hidden="true" />
      <span>Created by <b>Vimana Labs</b></span>
    </a>
  );
}
