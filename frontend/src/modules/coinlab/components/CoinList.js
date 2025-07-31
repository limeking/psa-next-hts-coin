// modules/coinlab/components/CoinList.js
export default function CoinList() {
    const coins = [
      { name: "BTC", price: 70000000, change: "+3%" },
      { name: "ETH", price: 4000000, change: "-1%" }
    ];
    return (
      <div>
        <h2>코인 리스트</h2>
        <ul>
          {coins.map(coin => (
            <li key={coin.name}>
              {coin.name} - {coin.price}원 ({coin.change})
            </li>
          ))}
        </ul>
      </div>
    );
  }
  