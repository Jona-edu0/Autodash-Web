import { useEffect, useRef, useState } from "react";
import { Bot, Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import "./VoiceAssistant.css";

const INITIAL_MESSAGE = {
  role: "assistant",
  text: "Hola. Puedo ayudarte con el vehículo, el clima, la navegación y la música.",
};

function normalizeSpeech(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function VoiceAssistant({ battery, speed, weather, onNavigate, launcherPlacement = "floating" }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [status, setStatus] = useState("");
  const recognitionRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, listening]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  function speak(text) {
    if (!speaking || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-MX";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function createAnswer(message) {
    const question = normalizeSpeech(message);

    if (/^(hola|buenas|hey)/.test(question)) {
      return "Hola. Estoy listo para ayudarte con AutoDash.";
    }
    if (question.includes("bateria") || question.includes("carga")) {
      return `La batería está al ${battery} por ciento${battery < 20 ? ". Conviene cargar pronto el vehículo" : ""}.`;
    }
    if (question.includes("velocidad") || question.includes("rapido") || question.includes("cuanto voy")) {
      return `Ahora el vehículo marca una velocidad demostrativa de ${speed} kilómetros por hora.`;
    }
    if (question.includes("clima") || question.includes("temperatura") || question.includes("tiempo")) {
      if (!weather?.current) return "Todavía no tengo datos del clima. Activa la ubicación para consultar el clima.";
      const temperature = weather.current.temp;
      const description = weather.current.weather?.[0]?.description || "condiciones disponibles";
      return `La temperatura actual es de aproximadamente ${Math.round(temperature)} grados, con ${description}.`;
    }
    if (question.includes("musica") || question.includes("cancion") || question.includes("deezer")) {
      onNavigate("Multimedia");
      return "Ya abrí Multimedia. Puedes buscar una canción en Deezer.";
    }
    if (question.includes("navegacion") || question.includes("ruta") || question.includes("mapa") || question.includes("destino")) {
      onNavigate("Navegación");
      return "Abrí Navegación para mostrarte rutas y destinos.";
    }
    if (question.includes("vehiculo") || question.includes("carro") || question.includes("auto")) {
      onNavigate("Vehículo");
      return "Abrí la sección del vehículo.";
    }
    if (question.includes("mantenimiento") || question.includes("servicio")) {
      onNavigate("Mantenimiento");
      return "Abrí el mantenimiento.";
    }
    if (question.includes("inicio") || question.includes("tablero")) {
      onNavigate("Inicio");
      return "Abrí el tablero principal.";
    }
    if (question.includes("ayuda") || question.includes("que puedes hacer")) {
      return "Puedo consultar la batería, velocidad y clima; abrir multimedia, navegación, vehículo y mantenimiento; o responder preguntas simples sobre la aplicación.";
    }
    return "Puedo ayudarte con la navegación, multimedia, clima, batería o velocidad. Intenta decir, por ejemplo, «abre navegación» o «qué batería tengo».";
  }

  function sendMessage(message = input) {
    const text = message.trim();
    if (!text) return;

    const answer = createAnswer(text);
    setMessages((current) => [...current, { role: "user", text }, { role: "assistant", text: answer }]);
    setInput("");
    speak(answer);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function toggleListening() {
    if (listening) {
      stopListening();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus("Este navegador no admite reconocimiento de voz. Puedes escribir tu pregunta.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => {
      setListening(true);
      setStatus("Escuchando...");
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      sendMessage(transcript);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setStatus(event.error === "not-allowed"
        ? "Permite el acceso al micrófono para usar la voz."
        : "No pude escuchar correctamente. Inténtalo otra vez.");
    };
    recognition.onend = () => {
      setListening(false);
      setStatus((current) => current === "Escuchando..." ? "" : current);
    };
    recognitionRef.current = recognition;
    setStatus("");
    try {
      recognition.start();
    } catch {
      setListening(false);
      setStatus("El reconocimiento ya está activo. Inténtalo de nuevo.");
    }
  }

  return (
    <>
      {open && (
        <section className="voice-assistant-panel glass" aria-label="Asistente de voz">
          <header>
            <div className="voice-assistant-brand"><Bot size={21} /><span>AutoDash AI</span></div>
            <div className="voice-assistant-actions">
              <button type="button" aria-label={speaking ? "Silenciar respuestas" : "Activar respuestas habladas"} onClick={() => {
                window.speechSynthesis?.cancel();
                setSpeaking((current) => !current);
              }}>
                {speaking ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <button type="button" aria-label="Cerrar asistente" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
          </header>
          <div className="voice-assistant-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`voice-message ${message.role}`}>{message.text}</div>
            ))}
            {status && <div className="voice-assistant-status">{status}</div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            <button className={`voice-mic-button ${listening ? "listening" : ""}`} type="button" aria-label={listening ? "Detener escucha" : "Hablar"} onClick={toggleListening}>
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <input value={input} onChange={(event) => setInput(event.target.value)} aria-label="Mensaje para AutoDash AI" placeholder="Escribe o habla..." />
            <button type="submit" aria-label="Enviar mensaje" disabled={!input.trim()}><Send size={18} /></button>
          </form>
        </section>
      )}
      {!open && (
        <button className={`voice-assistant-launcher ${launcherPlacement}`} type="button" aria-label="Abrir asistente de voz" onClick={() => setOpen(true)}>
          <Mic size={22} /><span>Asistente de voz</span>
        </button>
      )}
    </>
  );
}
