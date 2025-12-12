import { economy } from '../services/economy.js';
import logger from '../services/logger.js';

// --- UTILERÍAS DE JUEGO (Necesarias) ---

class Card {
    constructor(suit, value) {
        this.suit = suit;
        this.value = value;
    }
    toString() {
        return `${this.value}`;
    }
    getScoreValue() {
        if (['J', 'Q', 'K'].includes(this.value)) return 10;
        if (this.value === 'A') return 11;
        return parseInt(this.value);
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
        if (this.cards.length < 10) this.shuffle();
        return this.cards.pop();
    }
}

function calculateScore(hand) {
    let score = hand.reduce((sum, card) => sum + card.getScoreValue(), 0);
    let aces = hand.filter(card => card.value === 'A').length;

    while (score > 21 && aces > 0) {
        score -= 10;
        aces--;
    }
    return score;
}

function formatHand(hand, dealerShowAll = false) {
    const cards = hand.map(c => `[${c.value}]`).join(' ');
    
    if (hand.length === 2 && !dealerShowAll) {
        return `[${hand[0].value}] [?]`; 
    }
    
    return `${cards} (Puntaje: ${calculateScore(hand)})`;
}

function formatGame(game, showAll = false) {
    let msg = `♠️ *BLACKJACK - Apuesta: ${game.bet} Bs* ♣️\n\n`;
    
    msg += `🧑‍💼 *Dealer:* ${formatHand(game.dealerHand, showAll)}\n`;

    const pScore = calculateScore(game.playerHand);
    msg += `👤 *Tú:* ${formatHand(game.playerHand, true)}`;
    
    if (showAll) {
        msg += `\n\n--- FIN DEL JUEGO ---`;
    }
    
    return msg;
}

// --- LÓGICA DEL COMANDO ---

const sessions = new Map(); 

export async function blackjackCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const sender = m.sender;
    const action = args[0]?.toLowerCase();

    // Reacciona mientras busca la cuenta
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } }); 
    const userAccount = await economy.getUser(sender);
    await sock.sendMessage(jid, { react: { text: "🃏", key: m.key } });
    
    if (action === 'start') {
        if (sessions.has(jid)) {
            await sock.sendMessage(jid, { react: { text: "⚠️", key: m.key } });
            return sock.sendMessage(jid, { text: "⚠️ Ya hay un juego activo en este chat. Usa *#bj hit* o *#bj stand*." }, { quoted: m });
        }
        
        const bet = parseInt(args[1]) || 100;
        
        if (isNaN(bet) || bet < 10) return sock.sendMessage(jid, { text: "❌ La apuesta mínima es de *10 Bs*." }, { quoted: m });
        
        if (userAccount.money < bet) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return sock.sendMessage(jid, { text: `❌ *Saldo insuficiente.*\n💰 Tu cuenta: *${userAccount.money} Bs*\nNecesitas más dinero para esta apuesta.` }, { quoted: m });
        }

        // Descontar apuesta inmediatamente
        await economy.updateBalance(sender, -bet);

        const deck = new Deck(2); 
        const game = {
            playerHand: [deck.deal(), deck.deal()],
            dealerHand: [deck.deal(), deck.deal()],
            deck, bet, player: sender
        };

        sessions.set(jid, game);

        // Blackjack directo (Jugador)
        if (calculateScore(game.playerHand) === 21) {
            const winAmount = Math.floor(bet * 2.5); 
            await economy.updateBalance(sender, winAmount); 
            await economy.updateField(sender, 'wins', userAccount.wins + 1);

            const msg = formatGame(game, true) + `\n\n🥳 *¡BLACKJACK!* Has ganado *${winAmount} Bs*.`;
            sessions.delete(jid);
            await sock.sendMessage(jid, { react: { text: "💰", key: m.key } });
            return sock.sendMessage(jid, { text: msg }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
        return sock.sendMessage(jid, { text: formatGame(game) + `\n\nEscribe *#bj hit* (Pedir) o *#bj stand* (Plantarse).` }, { quoted: m });
    }

    // --- Lógica de Juego Activo ---
    
    const game = sessions.get(jid);
    if (!game) return sock.sendMessage(jid, { text: "❌ No hay un juego activo. Inicia uno con *#bj start [apuesta]*" }, { quoted: m });
    if (game.player !== sender) return sock.sendMessage(jid, { text: "❌ Este no es tu juego." }, { quoted: m });
    
    if (action === 'hit') {
        game.playerHand.push(game.deck.deal());
        const score = calculateScore(game.playerHand);

        if (score > 21) {
            sessions.delete(jid);
            await economy.updateField(sender, 'losses', userAccount.losses + 1);
            await sock.sendMessage(jid, { react: { text: "💥", key: m.key } });
            return sock.sendMessage(jid, { text: formatGame(game, true) + `\n\n💥 *TE PASASTE (Bust - ${score}).* Perdiste tu apuesta de *${game.bet} Bs*.` }, { quoted: m });
        }
        await sock.sendMessage(jid, { react: { text: "⬇️", key: m.key } });
        return sock.sendMessage(jid, { text: formatGame(game) }, { quoted: m });
    }

    if (action === 'stand') {
        await sock.sendMessage(jid, { react: { text: "⬆️", key: m.key } });
        let dScore = calculateScore(game.dealerHand);
        
        while (dScore < 17) {
            game.dealerHand.push(game.deck.deal());
            dScore = calculateScore(game.dealerHand);
        }

        const pScore = calculateScore(game.playerHand);
        let finalMsg = "";

        if (dScore > 21 || pScore > dScore) {
            const win = game.bet * 2; 
            await economy.updateBalance(sender, win);
            await economy.updateField(sender, 'wins', userAccount.wins + 1);
            finalMsg = `🎉 *¡GANASTE!* Recibes *${win} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "🥳", key: m.key } });
            
        } else if (dScore === pScore) {
            await economy.updateBalance(sender, game.bet); 
            finalMsg = `🤝 *EMPATE (Push).* Se te devuelven tus *${game.bet} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "🤝", key: m.key } });
            
        } else {
            await economy.updateField(sender, 'losses', userAccount.losses + 1);
            finalMsg = `❌ *EL DEALER GANA.* Pierdes *${game.bet} Bs*.`;
            await sock.sendMessage(jid, { react: { text: "😭", key: m.key } });
        }

        await sock.sendMessage(jid, { text: formatGame(game, true) + `\n\n${finalMsg}` }, { quoted: m });
        sessions.delete(jid); 
    }
}