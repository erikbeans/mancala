export default function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>How to play Kalah</h2>
        <ol>
          <li>The board has 6 pits on each side and a store at each end. Each pit starts with 4 or 6 seeds.</li>
          <li>On your turn, pick up all seeds from one of your pits and sow them one by one into the following pits, moving counter-clockwise — including your own store, but skipping your opponent's.</li>
          <li>If your last seed lands in your store, you get another turn.</li>
          <li>If your last seed lands in an empty pit on your side, you capture that seed plus all seeds in the pit directly opposite — they go into your store.</li>
          <li>When one side has no seeds left, the game ends and the other player sweeps all remaining seeds into their store.</li>
          <li>Whoever has the most seeds in their store wins. Equal scores are a draw.</li>
        </ol>
        <button className="primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
