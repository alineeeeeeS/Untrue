import { economy } from '../services/economy.js';
import logger from '../services/logger.js';

// Mapa para mantener los juegos activos
const activeGames = new Map();

// --- UTILERÍAS DE JUEGO (Necesarias) ---

class Card {
    constructor(suit, value) {
        this.suit = suit;
        this.value = value;
    }
    toString() {
        // Muestra la carta como 'A♠️', '10♥️', 'K♣️'
        return `${this.value}${this.suit}`; 
    }
    // Se elimina getScoreValue() para que la lógica de As esté centralizada en calculateScore
}

class Deck {
    constructor(numDecks = 1) {
        const suits = ['♠️', '♥️', '♣️', '♦️'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.cards = [];
        for (let i = 0; i < numDecks; i++) {
            for (const suit of suits) {
                for (const value of values) {
                    this.cards.push(new Card(suit, value));
                }
            }
        }
        this.shuffle();
    }
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }
    deal() {
        if (this.cards.length === 0) {
            // Recargar mazo (opcional, por simplicidad no lo hacemos, pero es buena práctica)
            throw new Error("Mazo agotado"); 
        }
        return this.cards.pop();
    }
}

/**
 * Calcula la puntuación de la mano, manejando el valor dinámico del As (11 o 1).
 * @param {Card[]} hand - El array de cartas.
 * @returns {number} La puntuación total de la mano.
 */
function calculateScore(hand) {
    let score = 0;
    let aceCount = 0;
    
    // 1. Calcular el score inicial, con J/Q/K como 10 y A como 11
    for (const card of hand) {
        if (['J', 'Q', 'K'].includes(card.value)) {
            score += 10;
        } else if (card.value === 'A') {
            score += 11;
            aceCount++;
        } else {
            score += parseInt(card.value);
        }
    }

    // 2. Ajustar Aces (de 11 a 1) si el score excede 21
    // La regla es: si con el As valiendo 11 te pasas de 21, el As vale 1.
    while (score > 21 && aceCount > 0) {
        score -= 10; // Cambia el valor de un As de 11 a 1 (11 - 10 = 1)
        aceCount--;
    }
    
    return score;
}

// Clase para encapsular el estado del juego
class BlackjackGame {
    constructor(bet) {
        this.deck = new Deck(1); // Mazo simple
        this.playerHand = [];
        this.dealerHand = [];
        this.bet = bet;
    }
    
    // Reparto inicial: 2 al jugador, 2 al dealer (1 oculta)
    start() {
        this.playerHand.push(this.deck.deal());
        this.dealerHand.push(this.deck.deal()); // Carta visible del dealer
        this.playerHand.push(this.deck.deal());
        this.dealerHand.push(this.deck.deal()); // Carta oculta del dealer
    }
    
    hit() {
        this.playerHand.push(this.deck.deal());
    }
}

// Función de visualización de manos
function getHandsDisplay(game, revealDealer = false) {
    const pHand = game.playerHand.map(c => c.toString()).join(' | ');
    const pScore = calculateScore(game.playerHand);
    
    let dHand, dScore;
    if (revealDealer) {
        dHand = game.dealerHand.map(c => c.toString()).join(' | ');
        dScore = calculateScore(game.dealerHand);
    } else {
        const dealerVisibleCard = game.dealerHand[0].toString();
        // Solo mostramos la carta visible del dealer
        dHand = `${dealerVisibleCard} | ❓`; 
        // No se muestra el score exacto, solo el valor de la carta visible
        dScore = calculateScore([game.dealerHand[0]]);
    }
    
    return { pHand, pScore, dHand, dScore };
}


/**
 * Manejador principal para #bj [apuesta], #hit, y #stand
 */
export async function blackjackCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const sender = m.sender;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const command = text.split(' ')[0].toLowerCase();
    
    const game = activeGames.get(sender);
    const action = command.slice(1); // bj, hit, stand

    // Si el usuario ya tiene un juego activo y no está usando #hit o #stand
    if (game && (action !== 'hit' && action !== 'stand')) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { 
            text: `⚠️ Ya tienes un juego de Blackjack activo con una apuesta de *${game.bet} Bs*.\n` +
                  `Usa *#hit* para pedir otra carta o *#stand* para plantarte.`
        }, { quoted: m });
    }

    // --- LÓGICA DE NUEVO JUEGO (#bj) ---
    if (action === 'bj') {
        if (game) {
            // Ya se manejó arriba, pero por seguridad
            activeGames.delete(sender); 
        }

        const betAmount = parseInt(args[0]);
        if (isNaN(betAmount) || betAmount < 50) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return sock.sendMessage(jid, { 
                text: '❌ *Uso correcto:* *#bj [apuesta]*\n(Apuesta mínima: 50 Bs)' 
            }, { quoted: m });
        }
        
        await sock.sendMessage(jid, { react: { text: "🃏", key: m.key } });

        const userAccount = await economy.getUser(sender);
        if (userAccount.money < betAmount) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return sock.sendMessage(jid, { text: `❌ Saldo insuficiente. Necesitas *${betAmount.toLocaleString('es-VE')} Bs*.` }, { quoted: m });
        }
        
        // Descontar la apuesta y crear el juego
        await economy.updateBalance(sender, -betAmount); 
        
        const newGame = new BlackjackGame(betAmount);
        newGame.start();
        
        activeGames.set(sender, newGame);

        // Chequeo de Blackjack inicial
        const pScore = calculateScore(newGame.playerHand);
        if (pScore === 21) {
            return await finalizeGame(sock, m, sender, newGame, userAccount, 'blackjack');
        }

        const { pHand, pScore: newPScore, dHand, dScore: newDScore } = getHandsDisplay(newGame, false);
        
        const message = `♦️ *BLACKJACK* ♦️\n\n` +
                        `💵 Apuesta: *${betAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*\n\n` +
                        `👤 *Tu Mano* (${newPScore}):\n   ${pHand}\n\n` +
                        `🤖 *Dealer* (${newDScore} visible):\n   ${dHand}\n\n` +
                        `¿Qué deseas hacer?\n*#hit* (Pedir carta) o *#stand* (Plantarse)`;
                        
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
        await sock.sendMessage(jid, { text: message }, { quoted: m });
        
        return;
    }
    
    // --- LÓGICA DE CONTINUACIÓN (#hit o #stand) ---
    if (!game) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { text: "❌ No tienes un juego de Blackjack activo. Usa *#bj [apuesta]* para empezar." }, { quoted: m });
    }
    
    const userAccount = await economy.getUser(sender);

    if (action === 'hit') {
        await sock.sendMessage(jid, { react: { text: "👇", key: m.key } });
        
        game.hit();
        const pScore = calculateScore(game.playerHand);
        
        if (pScore > 21) {
            // Bust (Te pasaste)
            return await finalizeGame(sock, m, sender, game, userAccount, 'bust');
            
        } else {
            // Juego continúa
            const { pHand, pScore: newPScore, dHand, dScore: newDScore } = getHandsDisplay(game, false);
            
            const message = `👇 *HIT* (Carta pedida)\n\n` +
                            `👤 *Tu Mano* (${newPScore}):\n   ${pHand}\n\n` +
                            `🤖 *Dealer* (${newDScore} visible):\n   ${dHand}\n\n` +
                            `¿Qué deseas hacer?\n*#hit* (Pedir carta) o *#stand* (Plantarse)`;
                            
            await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
            await sock.sendMessage(jid, { text: message }, { quoted: m });
        }
        
    } else if (action === 'stand') {
        await sock.sendMessage(jid, { react: { text: "⬆️", key: m.key } });
        
        // Turno del Dealer
        let dScore = calculateScore(game.dealerHand);
        
        // El dealer pide hasta que su puntuación sea 17 o más
        while (dScore < 17) {
            game.dealerHand.push(game.deck.deal());
            dScore = calculateScore(game.dealerHand);
        }

        const pScore = calculateScore(game.playerHand);
        
        return await finalizeGame(sock, m, sender, game, userAccount, 'stand');
    }
}

// --- FUNCIÓN PARA FINALIZAR EL JUEGO Y CALCULAR RESULTADOS ---
async function finalizeGame(sock, m, sender, game, userAccount, endType) {
    activeGames.delete(sender); // Eliminar el juego activo

    const pScore = calculateScore(game.playerHand);
    const dScore = calculateScore(game.dealerHand);
    
    const { pHand, dHand } = getHandsDisplay(game, true); // Revelar la mano del dealer

    let finalMsg = ``;
    let win = 0;
    
    if (endType === 'bust') {
        // Jugador se pasó de 21
        await economy.updateField(sender, 'losses', userAccount.losses + 1);
        finalMsg = `❌ *¡TE PASASTE!* (${pScore})\nPierdes tu apuesta de *${game.bet.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.`;
        await sock.sendMessage(jid, { react: { text: "😭", key: m.key } });
        
    } else if (endType === 'blackjack') {
        // Blackjack (21 con las 2 primeras cartas) - Paga 1.5 a 1
        win = Math.floor(game.bet * 2.5); 
        await economy.updateBalance(sender, win);
        await economy.updateField(sender, 'wins', userAccount.wins + 1);
        finalMsg = `♠️ *¡BLACKJACK!* ♠️\nRecibes *${win.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs* (Ganancia 1.5:1).`;
        await sock.sendMessage(jid, { react: { text: "🤑", key: m.key } });

    } else if (endType === 'stand') {
        // Fin normal (Jugador se planta) o fin después del turno del dealer
        
        if (dScore > 21) {
            // Dealer se pasa (Bust)
            win = game.bet * 2; 
            await economy.updateBalance(sender, win);
            await economy.updateField(sender, 'wins', userAccount.wins + 1);
            finalMsg = `🎉 *¡DEALER BUST!* (${dScore})\nRecibes *${win.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "🥳", key: m.key } });
            
        } else if (pScore > dScore) {
            // Jugador gana
            win = game.bet * 2; 
            await economy.updateBalance(sender, win);
            await economy.updateField(sender, 'wins', userAccount.wins + 1);
            finalMsg = `🎉 *¡GANASTE!* (${pScore} vs ${dScore})\nRecibes *${win.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "🥳", key: m.key } });
            
        } else if (dScore === pScore) {
            // Empate (Push)
            await economy.updateBalance(sender, game.bet); 
            finalMsg = `🤝 *EMPATE (Push).* (${pScore} vs ${dScore})\nSe te devuelven tus *${game.bet.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "🤝", key: m.key } });
            
        } else {
            // Dealer gana
            await economy.updateField(sender, 'losses', userAccount.losses + 1);
            finalMsg = `❌ *EL DEALER GANA.* (${dScore} vs ${pScore})\nPierdes *${game.bet.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "😭", key: m.key } });
        }
    }
    
    // Mensaje de resumen final
    const summaryMsg = `\n\n--- *RESULTADO FINAL* ---\n` +
                       `👤 *Tu Mano* (${pScore}):\n   ${pHand}\n` +
                       `🤖 *Dealer* (${dScore}):\n   ${dHand}\n\n` +
                       finalMsg;

    await sock.sendMessage(m.key.remoteJid, { text: summaryMsg }, { quoted: m });
}