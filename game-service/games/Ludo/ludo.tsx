import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { io, Socket } from "socket.io-client";

interface GameProps {
  gameName: string;
  gameId: string;
  playerId: string;
  opponentId: string;
  stakeAmount: number;
  tournamentId?: string;
  onGameEnd?: (result: GameResult) => void;
}

interface GameResult {
  winner: string;
  loser: string;
}

const GAME_BASE_URL = "http://localhost:3000"; // Change this to your server URL in production

const LudoGame: React.FC<GameProps> = ({
  gameName,
  gameId,
  playerId,
  opponentId,
  stakeAmount,
  tournamentId,
  onGameEnd,
}) => {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    initializeSocket();
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const initializeSocket = () => {
    const socket = io(GAME_BASE_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      socket.emit("joinGame", {
        gameId,
        playerId,
        opponentId,
        stakeAmount,
        tournamentId,
      });
    });

    socket.on("gameEnd", handleGameEnd);
    socketRef.current = socket;
  };

  const handleGameEnd = async (result: GameResult) => {
    setGameResult(result);
    setShowModal(true);
    
    if (result.winner === playerId) {
      try {
        await updateWallet(playerId, stakeAmount * 2);
      } catch (error) {
        console.error("Failed to update wallet:", error);
      }
    }
    
    onGameEnd?.(result);
  };

  const openGameInBrowser = async () => {
    setIsLoading(true);
    try {
      const gameUrl = `${GAME_BASE_URL}/game?gameId=${gameId}&playerId=${playerId}`;
      const result = await WebBrowser.openBrowserAsync(gameUrl);
      console.log("Game session ended:", result);
    } catch (error) {
      console.error("Failed to open game:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateWallet = async (userId: string, amount: number) => {
    const response = await fetch(`${GAME_BASE_URL}/api/wallet/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, amount, gameId, gameName }),
    });

    if (!response.ok) {
      throw new Error("Failed to update wallet");
    }

    return response.json();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={openGameInBrowser}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>
          {isLoading ? "Loading..." : `Play ${gameName}`}
        </Text>
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {gameResult?.winner === playerId ? "Victory!" : "Better luck next time!"}
            </Text>
            <Text style={styles.modalText}>
              {gameResult?.winner === playerId
                ? `You won ${stakeAmount * 2} coins!`
                : "You lost the game."}
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowModal(false);
                router.push("/(modal)/reg-declined");
              }}
            >
              <Text style={styles.modalButtonText}>Return to Games</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E0136",
  },
  button: {
    backgroundColor: "#FFCC00",
    padding: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "bold",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#1E0136",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    width: "80%",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  modalText: {
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 20,
    textAlign: "center",
  },
  modalButton: {
    backgroundColor: "#FFCC00",
    padding: 15,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
  },
  modalButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default LudoGame;
