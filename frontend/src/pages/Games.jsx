import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import Avatar from '../components/Avatar'
import { getSocket } from '../utils/socket'
import s from './Games.module.css'

export default function Games() {
  const { api, user, onlineUsers, addToast } = useContext(AppContext)
  const [friends,  setFriends]  = useState([])
  const [games,    setGames]    = useState([])
  const [activeGame, setActiveGame] = useState(null)
  const [gameType, setGameType] = useState('tictactoe')
  const [selecting, setSelecting] = useState(false)

  useEffect(() => {
    api('/friends').then(r => setFriends(r.data)).catch(()=>{})
    api('/games/active').then(r => setGames(r.data)).catch(()=>{})
  }, []) // eslint-disable-line

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onUpdate = (g) => {
      setGames(p => { const idx=p.findIndex(x=>x.id===g.id); return idx>=0?[...p.slice(0,idx),g,...p.slice(idx+1)]:[...p,g] })
      if (activeGame?.id === g.id) setActiveGame(g)
    }
    const onInvite = (d) => {
      addToast(`🎮 ${d.from_name} challenged you to ${d.game_type === 'tictactoe' ? 'Tic-Tac-Toe ❌⭕' : 'Rock Paper Scissors ✊'}!`, 'info')
      api('/games/active').then(r => setGames(r.data))
    }
    socket.on('game_update', onUpdate)
    socket.on('game_invite', onInvite)
    return () => { socket.off('game_update', onUpdate); socket.off('game_invite', onInvite) }
  }, [activeGame]) // eslint-disable-line

  async function challenge(friend) {
    try {
      const r = await api('/games/start', { method:'POST', data:{ opponent_id:friend.id, game_type:gameType } })
      const g = await api(`/games/${r.data.game_id}`)
      setActiveGame(g.data)
      setGames(p => [g.data, ...p])
      setSelecting(false)
      addToast(`Game started with ${friend.name}!`, 'success')
    } catch { addToast('Failed to start game', 'error') }
  }

  async function makeMove(pos) {
    if (!activeGame) return
    const myTurn = activeGame.current_turn === user?.id
    if (!myTurn || activeGame.status !== 'active') return
    try {
      const r = await api(`/games/${activeGame.id}/move`, { method:'POST', data:{ position:pos, choice:pos } })
      setActiveGame(r.data)
    } catch(e) { addToast(e.response?.data?.message || 'Invalid move', 'error') }
  }

  function renderTicTacToe(game) {
    const board   = game.state_json?.board || Array(9).fill(null)
    const myMark  = game.player1_id===user?.id ? 'X' : 'O'
    const myTurn  = game.current_turn===user?.id && game.status==='active'
    const winner  = game.winner_id
    return (
      <div className={s.tttBoard}>
        {board.map((cell, i) => (
          <button key={i} className={`${s.tttCell} ${cell?s.filled:myTurn?s.available:''}`}
            onClick={() => makeMove(i)} disabled={!!cell || !myTurn || game.status!=='active'}>
            <span className={cell==='X'?s.xMark:s.oMark}>{cell}</span>
          </button>
        ))}
        <div className={s.gameStatus}>
          {game.status==='finished'
            ? winner===user?.id ? '🏆 You Won!' : winner ? '😢 You Lost!' : '🤝 Draw!'
            : myTurn ? '👆 Your turn' : '⏳ Waiting...'
          }
        </div>
      </div>
    )
  }

  function renderRPS(game) {
    const choices = game.state_json?.choices || {}
    const myChoice = choices[String(user?.id)]
    const options = [{ v:'rock',e:'✊' },{ v:'scissors',e:'✌️' },{ v:'paper',e:'✋' }]
    const myTurn = game.current_turn===user?.id && game.status==='active' && !myChoice
    return (
      <div className={s.rpsArea}>
        <div className={s.rpsButtons}>
          {options.map(o => (
            <button key={o.v} className={`${s.rpsBtn} ${myChoice===o.v?s.rpsPicked:''}`}
              onClick={() => makeMove(o.v)} disabled={!!myChoice || !myTurn || game.status!=='active'}>
              <span style={{fontSize:44}}>{o.e}</span>
              <span style={{fontSize:12,marginTop:4}}>{o.v}</span>
            </button>
          ))}
        </div>
        <div className={s.gameStatus}>
          {game.status==='finished'
            ? game.winner_id===user?.id ? '🏆 You Won!' : game.winner_id ? '😢 You Lost!' : '🤝 Draw!'
            : myChoice ? '⏳ Waiting for opponent...' : '👆 Choose!'
          }
        </div>
        {/* Show both choices clearly when game ends */}
        {game.status==='finished' && Object.keys(choices).length===2 && (
          <div className={s.rpsResult}>
            {(() => {
              const myId  = String(user?.id)
              const oppId = Object.keys(choices).find(k => k !== myId)
              const myC   = options.find(o => o.v === choices[myId])
              const oppC  = options.find(o => o.v === choices[oppId])
              return (
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:8}}>Results</div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16}}>
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:48}}>{myC?.e || '?'}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>You</div>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{myC?.v}</div>
                    </div>
                    <div style={{fontSize:22,color:'var(--text-muted)',fontWeight:700}}>vs</div>
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:48}}>{oppC?.e || '?'}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Opponent</div>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{oppC?.v}</div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
        {/* Show your choice while waiting */}
        {game.status==='active' && myChoice && Object.keys(choices).length===1 && (
          <div style={{textAlign:'center',padding:'8px 0',color:'var(--text-secondary)',fontSize:13}}>
            You chose <strong>{options.find(o=>o.v===myChoice)?.e} {myChoice}</strong> — waiting for opponent...
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>🎮 Games</h1>
        <button className={s.challengeBtn} onClick={() => setSelecting(true)}>⚔️ Challenge Friend</button>
      </div>

      {/* Active Games */}
      {games.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Active Games</div>
          <div className={s.gameList}>
            {games.map(g => {
              const oppId = g.player1_id===user?.id ? g.player2_id : g.player1_id
              const oppName = g.player1_id===user?.id ? g.p2_name : g.p1_name
              const oppColor = g.player1_id===user?.id ? g.p2_color : g.p1_color
              const isMyTurn = g.current_turn===user?.id && g.status==='active'
              return (
                <div key={g.id} className={`${s.gameCard} ${isMyTurn?s.myTurn:''}`} onClick={() => setActiveGame(g)}>
                  <div className={s.gameCardIcon}>{g.game_type==='tictactoe'?'❌⭕':'✊'}</div>
                  <div className={s.gameCardInfo}>
                    <div className={s.gameCardName}>vs {oppName}</div>
                    <div className={s.gameCardStatus}>
                      {g.status==='finished'
                        ? g.winner_id===user?.id?'🏆 You won!'
                          : g.winner_id?'😢 You lost'
                          :'🤝 Draw'
                        : isMyTurn?'👆 Your turn!':'⏳ Their turn'
                      }
                    </div>
                  </div>
                  {isMyTurn && <div className={s.turnDot} />}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active game board */}
      {activeGame && (
        <div className={s.boardSection}>
          <div className={s.boardHeader}>
            <button className={s.backBtn} onClick={() => setActiveGame(null)}>← Back</button>
            <div className={s.boardTitle}>
              {activeGame.game_type==='tictactoe'?'❌⭕ Tic-Tac-Toe':'✊ Rock Paper Scissors'}
            </div>
          </div>
          {activeGame.game_type==='tictactoe' ? renderTicTacToe(activeGame) : renderRPS(activeGame)}
        </div>
      )}

      {/* Friend selector */}
      {selecting && (
        <div className={s.overlay} onClick={() => setSelecting(false)}>
          <div className={s.modal} onClick={e=>e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3>Choose a friend to challenge</h3>
              <button className={s.closeBtn} onClick={()=>setSelecting(false)}>✕</button>
            </div>
            <div className={s.gameTypeRow}>
              <button className={`${s.typeBtn} ${gameType==='tictactoe'?s.typeActive:''}`} onClick={()=>setGameType('tictactoe')}>❌⭕ Tic-Tac-Toe</button>
              <button className={`${s.typeBtn} ${gameType==='rps'?s.typeActive:''}`} onClick={()=>setGameType('rps')}>✊ Rock Paper Scissors</button>
            </div>
            <div className={s.friendList}>
              {friends.map(f => (
                <div key={f.id} className={s.friendRow} onClick={() => challenge(f)}>
                  <Avatar user={f} size={40} online={onlineUsers.has(f.id)} />
                  <div className={s.friendName}>{f.name}</div>
                  <div className={s.challengeTag}>⚔️ Challenge</div>
                </div>
              ))}
              {friends.length===0 && <div className={s.empty}>Add friends to challenge them!</div>}
            </div>
          </div>
        </div>
      )}

      {games.length===0 && !activeGame && !selecting && (
        <div className={s.emptyState}>
          <div style={{fontSize:64}}>🎮</div>
          <div style={{fontSize:18,fontWeight:700,color:'var(--text-primary)',marginTop:8}}>No active games</div>
          <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>Challenge a friend to Tic-Tac-Toe or Rock Paper Scissors!</div>
          <button className={s.challengeBtn} style={{marginTop:12}} onClick={()=>setSelecting(true)}>⚔️ Start a Game</button>
        </div>
      )}
    </div>
  )
}
