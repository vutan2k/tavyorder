import { useEffect, useState } from 'react';
import { getLivePrice } from '../services/livePrice';

const HIGH_RATIO = 1.25;
const LOW_RATIO = 0.7;

function dbPriceRefs(product) {
  const vals = [];
  const push = (v) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) vals.push(n);
  };
  push(product?.price_krw);
  push(product?.price);
  push(product?.foreignPrice);
  push(product?.priceKrw);
  push(product?.priceWon);
  if (Array.isArray(product?.options)) {
    for (const o of product.options) {
      push(o?.price_krw);
      push(o?.price);
      push(o?.sale_price);
    }
  }
  return vals;
}

/**
 * Gate 1: giá live cho trang chi tiết.
 * status: idle | loading | ok | mismatch | failed
 */
export default function useLivePrice(product) {
  const [state, setState] = useState({ status: 'idle' });
  const id = product?.goodsNo || product?.id;

  useEffect(() => {
    if (!id) {
      setState({ status: 'idle' });
      return undefined;
    }
    let alive = true;
    setState({ status: 'loading' });
    getLivePrice(product)
      .then((d) => {
        if (!alive) return;
        if (!d.ok) {
          setState({ status: 'failed', error: d.error || 'price_unavailable' });
          return;
        }
        const won = Number(d.won) || 0;
        const refs = dbPriceRefs(product);
        let ratio = null;
        if (refs.length && won > 0) {
          const lo = Math.min(...refs);
          const hi = Math.max(...refs);
          if (won > hi * HIGH_RATIO || won < lo * LOW_RATIO) ratio = won / (won > hi ? hi : lo);
        }
        if (ratio !== null) {
          setState({
            status: 'mismatch',
            won,
            ratio: Number(ratio.toFixed(2)),
            error: 'price_source_mismatch',
          });
          return;
        }
        setState({
          status: 'ok',
          won,
          originWon: Number(d.originWon) || 0,
          soldOut: Boolean(d.soldOut),
          ageSec: d.ageSec || 0,
        });
      })
      .catch((e) => {
        if (alive) setState({ status: 'failed', error: e?.message || 'price_unavailable' });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return state;
}
