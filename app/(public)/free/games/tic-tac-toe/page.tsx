'use client';

import React, { useState, useEffect } from 'react';
import { PartyPopper, Handshake } from 'lucide-react';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
}

const TicTacToe = () => {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [gameStatus, setGameStatus] = useState('playing'); // 'playing', 'won', 'draw'
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState<number[]>([]);
  const [scores, setScores] = useState({ X: 0, O: 0, draws: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const [gameMode, setGameMode] = useState('human'); // 'human' or 'ai'

  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6] // diagonals
  ];

  const checkWinner = (squares) => {
    for (let pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { winner: squares[a], line: pattern };
      }
    }
    return null;
  };

  const getBestMove = (squares, player) => {
    // Simple AI that tries to win, then block, then take center/corners
    const opponent = player === 'X' ? 'O' : 'X';
    
    // Try to win
    for (let i = 0; i < 9; i++) {
      if (!squares[i]) {
        const testBoard = [...squares];
        testBoard[i] = player;
        if (checkWinner(testBoard)?.winner === player) {
          return i;
        }
      }
    }
    
    // Try to block opponent
    for (let i = 0; i < 9; i++) {
      if (!squares[i]) {
        const testBoard = [...squares];
        testBoard[i] = opponent;
        if (checkWinner(testBoard)?.winner === opponent) {
          return i;
        }
      }
    }
    
    // Take center if available
    if (!squares[4]) return 4;
    
    // Take corners
    const corners = [0, 2, 6, 8];
    const availableCorners = corners.filter(i => !squares[i]);
    if (availableCorners.length > 0) {
      return availableCorners[Math.floor(Math.random() * availableCorners.length)];
    }
    
    // Take any available space
    const available = squares.map((sq, i) => sq === null ? i : null).filter(val => val !== null);
    return available[Math.floor(Math.random() * available.length)];
  };

  const createParticles = (x, y) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 15; i++) {
      newParticles.push({
        id: Math.random(),
        x: x + (Math.random() - 0.5) * 100,
        y: y + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1,
        decay: 0.02 + Math.random() * 0.02
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(prev => 
        prev.map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          life: p.life - p.decay
        })).filter(p => p.life > 0)
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const result = checkWinner(board);
    if (result) {
      setWinner(result.winner);
      setWinningLine(result.line);
      setGameStatus('won');
      setScores(prev => ({ ...prev, [result.winner]: prev[result.winner] + 1 }));
      
      setTimeout(() => {
        createParticles(400, 300);
      }, 500);
    } else if (board.every(cell => cell !== null)) {
      setGameStatus('draw');
      setScores(prev => ({ ...prev, draws: prev.draws + 1 }));
    }
  }, [board]);

  useEffect(() => {
    if (gameMode === 'ai' && !isXNext && gameStatus === 'playing') {
      const timer = setTimeout(() => {
        const move = getBestMove(board, 'O');
        if (move !== undefined) {
          handleClick(move, true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [board, isXNext, gameStatus, gameMode]);

  const handleClick = (index, isAI = false) => {
    if (board[index] || gameStatus !== 'playing') return;

    const newBoard = [...board];
    newBoard[index] = isXNext ? 'X' : 'O';
    setBoard(newBoard);
    setIsXNext(!isXNext);

    if (!isAI) {
      const cellElement = document.getElementById(`cell-${index}`);
      if (cellElement) {
        const rect = cellElement.getBoundingClientRect();
        createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsXNext(true);
    setGameStatus('playing');
    setWinner(null);
    setWinningLine([]);
    setParticles([]);
  };

  const resetScores = () => {
    setScores({ X: 0, O: 0, draws: 0 });
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse delay-500"></div>
      </div>

      {/* Floating particles */}
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute w-2 h-2 bg-gradient-to-r from-yellow-400 to-pink-400 rounded-full pointer-events-none"
          style={{
            left: particle.x,
            top: particle.y,
            opacity: particle.life,
            transform: `scale(${particle.life})`
          }}
        />
      ))}

      <div className="relative z-10 text-center">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4 tracking-wider">
            MATRX
          </h1>
          <p className="text-xl text-gray-300 font-light">Ultimate TicTacToe Experience</p>
        </div>

        {/* Game Mode Toggle */}
        <div className="mb-6 flex justify-center">
          <div className="bg-black/30 backdrop-blur-sm rounded-full p-1 border border-white/20">
            <button
              onClick={() => {setGameMode('human'); resetGame();}}
              className={`px-6 py-2 rounded-full transition-all duration-300 ${
                gameMode === 'human' 
                ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white'
              }`}
            >
              Human vs Human
            </button>
            <button
              onClick={() => {setGameMode('ai'); resetGame();}}
              className={`px-6 py-2 rounded-full transition-all duration-300 ${
                gameMode === 'ai' 
                ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white'
              }`}
            >
              Human vs AI
            </button>
          </div>
        </div>

        {/* Game Status */}
        <div className="mb-6 h-12 flex items-center justify-center">
          {gameStatus === 'playing' && (
            <div className="text-2xl font-semibold text-white flex items-center gap-3">
              <span className="text-gray-300">Next:</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xl transition-all duration-300 ${
                isXNext 
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/50' 
                : 'bg-gradient-to-r from-pink-500 to-red-500 text-white shadow-lg shadow-pink-500/50'
              }`}>
                {isXNext ? 'X' : 'O'}
              </div>
            </div>
          )}
          {gameStatus === 'won' && (
            <div className="flex items-center justify-center gap-2 animate-bounce">
              <PartyPopper className="w-8 h-8 text-yellow-400" />
              <span className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">Player {winner} Wins!</span>
              <PartyPopper className="w-8 h-8 text-orange-400" />
            </div>
          )}
          {gameStatus === 'draw' && (
            <div className="flex items-center justify-center gap-2 text-3xl font-bold text-gray-300 animate-pulse">
              It's a Draw! <Handshake className="w-8 h-8 text-gray-300" />
            </div>
          )}
        </div>

        {/* Game Board */}
        <div className="mb-8 flex justify-center">
          <div className="grid grid-cols-3 gap-3 p-6 bg-black/20 backdrop-blur-sm rounded-3xl border border-white/10 shadow-2xl">
            {board.map((cell, index) => (
              <button
                key={index}
                id={`cell-${index}`}
                onClick={() => handleClick(index)}
                className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 font-bold text-3xl relative overflow-hidden ${
                  winningLine.includes(index)
                    ? 'bg-gradient-to-r from-yellow-400 to-orange-400 border-yellow-300 shadow-lg shadow-yellow-400/50 animate-pulse'
                    : cell
                    ? 'bg-black/40 border-white/30'
                    : 'bg-black/20 border-white/20 hover:bg-white/10 hover:border-white/40'
                }`}
                disabled={gameStatus !== 'playing' || cell !== null}
              >
                {cell && (
                  <span className={`${
                    cell === 'X' 
                    ? 'text-cyan-400 drop-shadow-lg' 
                    : 'text-pink-400 drop-shadow-lg'
                  } ${winningLine.includes(index) ? 'text-white' : ''} transition-all duration-300`}>
                    {cell}
                  </span>
                )}
                {!cell && gameStatus === 'playing' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 to-purple-500/0 hover:from-cyan-500/20 hover:to-purple-500/20 rounded-2xl transition-all duration-300"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Scoreboard */}
        <div className="mb-8 flex justify-center">
          <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h3 className="text-xl font-semibold text-white mb-4">Scoreboard</h3>
            <div className="flex gap-8 text-center">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center font-bold text-xl text-white mb-2 shadow-lg">
                  X
                </div>
                <span className="text-2xl font-bold text-white">{scores.X}</span>
                <span className="text-sm text-gray-400">Player 1</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-gradient-to-r from-gray-600 to-gray-500 rounded-xl flex items-center justify-center font-bold text-xl text-white mb-2 shadow-lg">
                  =
                </div>
                <span className="text-2xl font-bold text-white">{scores.draws}</span>
                <span className="text-sm text-gray-400">Draws</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-red-500 rounded-xl flex items-center justify-center font-bold text-xl text-white mb-2 shadow-lg">
                  O
                </div>
                <span className="text-2xl font-bold text-white">{scores.O}</span>
                <span className="text-sm text-gray-400">{gameMode === 'ai' ? 'AI' : 'Player 2'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-4 justify-center flex-wrap">
          <button
            onClick={resetGame}
            className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/50"
          >
            🎮 New Game
          </button>
          <button
            onClick={resetScores}
            className="px-8 py-3 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-red-500/50"
          >
            🔄 Reset Scores
          </button>
        </div>

        {/* Footer */}
        <div className="mt-12 text-gray-400 text-sm">
          <p>Built with React & Tailwind CSS</p>
          <p className="mt-1">✨ The future of TicTacToe ✨</p>
        </div>
      </div>
    </div>
  );
};

export default TicTacToe;