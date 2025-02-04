import { useRouter } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

const GAME_BASE_URL = "http://localhost:3000";

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
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    // Initialize socket when component mounts
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

  const startGame = async () => {
    if (gameStarted) return;
    
    setIsLoading(true);
    setGameStarted(true);
    
    try {
      const url = `${GAME_BASE_URL}/game?gameId=${gameId}&playerId=${playerId}&gameName=${gameName}`;
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error("Failed to launch game:", error);
      setGameStarted(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGameEnd = async (result: GameResult) => {
    setGameResult(result);
    setShowModal(true);
    setGameStarted(false);

    if (result.winner === playerId) {
      try {
        await updateWallet(playerId, stakeAmount * 2);
      } catch (error) {
        console.error("Failed to update wallet:", error);
      }
    }

    onGameEnd?.(result);
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
      {!gameStarted && !isLoading && (
        <TouchableOpacity
          style={styles.startButton}
          onPress={startGame}
        >
          <Text style={styles.startButtonText}>Start Game</Text>
        </TouchableOpacity>
      )}

      {isLoading && (
        <View>
          <ActivityIndicator size="large" color="#FFCC00" />
          <Text style={styles.loadingText}>Launching {gameName}...</Text>
        </View>
      )}

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {gameResult?.winner === playerId
                ? "Victory!"
                : "Better luck next time!"}
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
  loadingText: {
    color: "#FFFFFF",
    marginTop: 10,
    fontSize: 16,
  },
  startButton: {
    backgroundColor: "#FFCC00",
    padding: 15,
    borderRadius: 8,
    width: "80%",
    alignItems: "center",
    marginBottom: 20,
  },
  startButtonText: {
    color: "#000000",
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
});

export default LudoGame;