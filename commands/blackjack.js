import { economy } from '../services/economy.js';
import logger from '../services/logger.js';

// Mapa para mantener los juegos activos
const activeGames = new Map();

// --- UTILERÍAS DE JUEGO ---

class Card {
    constructor(suit, value) {
        this.suit = suit;
        this.value = value;
    }
    toString() {
        // Muestra la carta como 'A♠️', '10♥️', 'K♣️'
        return `${this.value}${this.suit}`; 
    }
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
    while (score > 21 && aceCount > 0) {
        score -= 10; // Cambia el valor de un As de 11 a 1
        aceCount--;
    }
    
    return score;
}

// Clase para encapsular el estado del juego
class BlackjackGame {
    constructor(bet) {
        this.deck = new Deck(1); 
        this.playerHand = [];
        this.dealerHand = [];
        this.bet = bet;
    }
    
    start() {
        this.playerHand.push(this.deck.deal());
        this.dealerHand.push(this.deck.deal()); 
        this.playerHand.push(this.deck.deal());
        this.dealerHand.push(this.deck.deal()); 
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
        dHand = `${dealerVisibleCard} | ❓`; 
        dScore = calculateScore([game.dealerHand[0]]);
    }
    
    return { pHand, pScore, dHand, dScore };
}


/**
 * Manejador principal para #bj [start/hit/stand] [apuesta]
 */
export async function blackjackCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const sender = m.key.participant || m.sender;
    const action = args[0] ? args[0].toLowerCase() : ''; 
    const rawBet = args[1];
    
    // Usar el 'sender' corregido para buscar el juego activo
    const game = activeGames.get(sender);
    
    // --- LÓGICA DE NUEVO JUEGO (#bj start [monto]) ---
    if (action === 'start') {
        if (game) {
             await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
             return sock.sendMessage(jid, { 
                 text: `⚠️ Ya tienes un juego de Blackjack activo con *${game.bet} Bs*.\n` +
                         `▸ Usa *#hit* o *#stand* para continuar. `
             }, { quoted: m });
        }

        // 1. Obtener el saldo del usuario primero
        const userAccount = await economy.getUser(sender);

        let betAmount;
        
        // 2. Determinar el monto de la apuesta (manejar 'all' y parsear robustamente)
        if (rawBet && rawBet.toLowerCase() === 'all') {
            betAmount = userAccount.money; // Apuesta el saldo total
        } else {
            // Parseo más robusto: Number() intenta convertir a número y Math.floor() asegura un entero.
            betAmount = Math.floor(Number(rawBet));
        }

        if (isNaN(betAmount) || betAmount < 50) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            // Mensaje de error actualizado
            return sock.sendMessage(jid, { 
                text: '❌ *Uso correcto:*\n▸ #bj start _apuesta_ (Mínimo 50 Bs) o _all_\n▸ *Apuesta mínima:* 50 Bs' 
            }, { quoted: m });
        }
        
        await sock.sendMessage(jid, { react: { text: "🃏", key: m.key } });

        // 3. Verificación de saldo
        if (userAccount.money < betAmount) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            // Mensaje de error actualizado para mostrar saldo actual
            return sock.sendMessage(jid, { 
                text: `❌ Saldo insuficiente. Tu saldo es *${userAccount.money.toLocaleString('es-VE')} Bs*. Necesitas *${betAmount.toLocaleString('es-VE')} Bs*.` 
            }, { quoted: m });
        }
        
        // 4. Descontar la apuesta y crear el juego
        await economy.updateBalance(sender, -betAmount); 
        
        const newGame = new BlackjackGame(betAmount);
        newGame.start();
        
        // Usar el 'sender' corregido para almacenar el juego
        activeGames.set(sender, newGame);

        const pScore = calculateScore(newGame.playerHand);
        
        // 5. Chequeo de Blackjack inicial
        if (pScore === 21) {
            return await finalizeGame(sock, m, sender, newGame, userAccount, 'blackjack');
        }

        // 6. Mostrar estado inicial
        const { pHand, pScore: newPScore, dHand, dScore: newDScore } = getHandsDisplay(newGame, false);
        
        const message = `♦️ *BLACKJACK INICIADO* ♦️\n\n` +
                        `💵 Apuesta: *${betAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*\n\n` +
                        `👤 *Tu Mano* (${newPScore}):\n    ${pHand}\n\n` +
                        `🤖 *Dealer* (${newDScore} visible):\n    ${dHand}\n\n` +
                        `¿Qué deseas hacer?\n*#hit* (Pedir carta) o *#stand* (Plantarse)`;
                        
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
        await sock.sendMessage(jid, { text: message }, { quoted: m });
        
        return;
    }
    
    // --- LÓGICA DE CONTINUACIÓN (#hit o #stand) ---
    if (action === 'hit' || action === 'stand') {
        // Usa el 'game' asociado al 'sender' corregido
        if (!game) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return sock.sendMessage(jid, { text: "❌ No tienes un juego de Blackjack activo\n▸ Usa *#bj start _apuesta_* para empezar." }, { quoted: m });
        }
        
        // Usar el 'sender' corregido
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
                                 `👤 *Tu Mano* (${newPScore}):\n    ${pHand}\n\n` +
                                 `🤖 *Dealer* (${newDScore} visible):\n    ${dHand}\n\n` +
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

            // El juego finaliza después del turno del dealer
            return await finalizeGame(sock, m, sender, game, userAccount, 'stand');
        }
        
    } else {
           // Comando mal escrito o acción desconocida
           await sock.sendMessage(jid, { react: { text: "❓", key: m.key } });
           return sock.sendMessage(jid, { 
               text: `❓ *Uso correcto:*\n` +
                     `▸ #bj start _apuesta_` 
           }, { quoted: m });
    }
}

// --- FUNCIÓN PARA FINALIZAR EL JUEGO Y CALCULAR RESULTADOS ---
async function finalizeGame(sock, m, sender, game, userAccount, endType) {
    const jid = m.key.remoteJid;
    // 'sender' ya está corregido aquí.
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
        win = Math.floor(game.bet * 2.5); // 1.5 de ganancia + 1 de devolución
        await economy.updateBalance(sender, win);
        await economy.updateField(sender, 'wins', userAccount.wins + 1);
        
        const netGain = win - game.bet;
        finalMsg = `♠️ *¡BLACKJACK!* ♠️\nGanancia neta: *${netGain.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs* (Paga 1.5:1).`;
        await sock.sendMessage(jid, { react: { text: "🤑", key: m.key } });

    } else if (endType === 'stand') {
        // Fin normal después del turno del dealer
        
        if (dScore > 21) {
            // Dealer se pasa (Bust)
            win = game.bet * 2; // Gana el doble (devuelve apuesta + gana una apuesta)
            await economy.updateBalance(sender, win);
            await economy.updateField(sender, 'wins', userAccount.wins + 1);
            finalMsg = `🎉 *¡DEALER BUST!* (${dScore})\nGanancia neta: *${game.bet.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "🥳", key: m.key } });
            
        } else if (pScore > dScore) {
            // Jugador gana
            win = game.bet * 2; 
            await economy.updateBalance(sender, win);
            await economy.updateField(sender, 'wins', userAccount.wins + 1);
            finalMsg = `🎉 *¡GANASTE!* (${pScore} vs ${dScore})\nGanancia neta: *${game.bet.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "🥳", key: m.key } });
            
        } else if (dScore === pScore) {
            // Empate (Push)
            await economy.updateBalance(sender, game.bet); // Devuelve la apuesta
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
                         `👤 *Tu Mano* (${pScore}):\n    ${pHand}\n` +
                         `🤖 *Dealer* (${dScore}):\n    ${dHand}\n\n` +
                         finalMsg;

    await sock.sendMessage(jid, { text: summaryMsg }, { quoted: m });
}