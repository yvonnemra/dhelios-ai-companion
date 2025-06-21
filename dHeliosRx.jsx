import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

// IMPORTANT: In a real Pi app, you'd typically initialize Pi SDK here for user authentication and payments.
// Example (conceptual):
// import Pi from 'pi-sdk'; // Assuming a Pi SDK library is available and imported
// const piSdk = new Pi();
// piSdk.init({ version: '1.0', appName: 'MyPiAIAgent', scopes: ['payments', 'username'] });

// Global variables provided by the Canvas environment (these would be your actual Firebase config in a real deployment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';




const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  // measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID // If you added this
};


const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase App and Services
let firebaseApp;
let db;
let auth;

try {
  firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
  auth = getAuth(firebaseApp);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState(null); // This would ideally come from Pi SDK for Pi identity
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [piUser, setPiUser] = useState(null); // State for Pi Network user data
  const messagesEndRef = useRef(null);

  // Scroll to the latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // --- Firebase Authentication Setup ---
    // This handles anonymous sign-in for chat history persistence.
    // In a full Pi app, you might use Pi SDK for primary user identification,
    // and then link that to a Firebase user if needed for other backend services.
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        if (!initialAuthToken) {
          try {
            await signInAnonymously(auth);
            console.log("Signed in anonymously to Firebase.");
          } catch (error) {
            console.error("Anonymous Firebase sign-in failed:", error);
          }
        }
      }
      setIsAuthReady(true);
    });

    if (initialAuthToken) {
      signInWithCustomToken(auth, initialAuthToken)
        .then((userCredential) => {
          console.log("Signed in with custom Firebase token:", userCredential.user.uid);
        })
        .catch((error) => {
          console.error("Custom Firebase token sign-in failed:", error);
          signInAnonymously(auth)
            .then(() => console.log("Signed in anonymously to Firebase after token failure."))
            .catch((anonError) => console.error("Anonymous Firebase sign-in fallback failed:", anonError));
        });
    }

    // --- Pi SDK Initialization (Conceptual for a Pi App) ---
    // This part is illustrative. Actual Pi SDK integration would involve:
    // 1. Initializing the SDK.
    // 2. Requesting user authentication.
    // 3. Handling success/failure callbacks to get the Pi user's data (e.g., username, ID).
    // 4. Using the Pi user ID for app-specific logic and potentially linking to your Firebase userId.

    // Example of a conceptual Pi SDK authentication call:
    /*
    if (typeof piSdk !== 'undefined') {
      piSdk.authenticate((auth) => {
        if (auth.user) {
          setPiUser(auth.user);
          // You might use auth.user.uid or auth.user.username as your primary userId for Pi-specific data
          // setUserId(auth.user.uid); // Or derive a unique ID from Pi user data
          console.log("Authenticated with Pi Network:", auth.user.username);
        } else if (auth.error) {
          console.error("Pi SDK authentication error:", auth.error.message);
        }
      });
    } else {
        console.warn("Pi SDK not available in this environment. Running as a standalone web app.");
    }
    */

    return () => {
      unsubscribeAuth();
      // Optionally, piSdk.deauthenticate() or similar if your app manages sessions.
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady || !db || !userId) return; // Wait for Firebase auth and userId

    // In a real Pi app, you might use piUser.uid or a derived ID instead of Firebase userId
    // for collections directly tied to Pi Network identity.
    const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/messages`);
    const q = query(chatCollectionRef, orderBy('timestamp', 'asc'));

    const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(fetchedMessages);
      scrollToBottom();
    }, (error) => {
      console.error("Error fetching messages:", error);
    });

    return () => unsubscribeSnapshot();
  }, [isAuthReady, db, userId]);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (input.trim() === '' || isLoading || !userId) return; // Ensure userId is available

    const userMessage = {
      text: input,
      sender: 'user',
      timestamp: serverTimestamp(),
      userId: userId // Using Firebase userId for chat history
      // piUsername: piUser ? piUser.username : 'Guest' // Optionally store Pi username
    };

    try {
      setIsLoading(true);
      const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/messages`);
      await setDoc(doc(chatCollectionRef), userMessage);

      setInput('');

      // Call the Gemini API for the AI response
      const chatHistory = [{ role: "user", parts: [{ text: input }] }];
      const payload = { contents: chatHistory };

	const apiKey = process.env.REACT_APP_GEMINI_API_KEY; // This will now get the value from Netlify





      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      let aiResponseText = "Sorry, I couldn't get a response. Please try again.";
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        aiResponseText = result.candidates[0].content.parts[0].text;
      }

      const aiMessage = {
        text: aiResponseText,
        sender: 'ai',
        timestamp: serverTimestamp(),
        userId: userId
      };

      await setDoc(doc(chatCollectionRef), aiMessage);

      // --- Conceptual Pi Payment Integration (if you had premium features) ---
      /*
      if (aiResponseText.includes("premium feature unlocked") && piUser) {
        try {
          const paymentResult = await piSdk.createPayment({
            amount: 0.01, // Example small amount in Pi
            memo: 'AI Agent Premium Access',
            metadata: { feature: 'premium_ai_response' }
          });
          console.log("Pi Payment successful:", paymentResult);
        } catch (paymentError) {
          console.error("Pi Payment failed:", paymentError);
          // Handle payment failure in UI (e.g., show a message to user)
        }
      }
      */

    } catch (error) {
      console.error("Error sending message or getting AI response:", error);
      const errorMessage = {
        text: "There was an error processing your request. Please try again.",
        sender: 'ai',
        timestamp: serverTimestamp(),
        userId: userId
      };
      await setDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/messages`)), errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-inter antialiased">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 shadow-md rounded-b-lg">
        <h1 className="text-3xl font-bold text-center">dHeliosAI Companion</h1>
        <p className="text-sm text-center opacity-80 mt-1">Your smart companion in the Pi ecosystem</p>
        {userId && (
          <div className="text-xs text-center mt-2 opacity-70">
            {/* Displaying user ID for debugging/identification in Pi context */}
            App User ID: {userId}
            {piUser && ` (Pi User: ${piUser.username})`}
          </div>
        )}
        {!isAuthReady && (
            <div className="text-sm text-center mt-2 text-yellow-300">
                Initializing app...
            </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={message.id || index}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg shadow-md break-words ${
                message.sender === 'user'
                  ? 'bg-blue-500 text-white rounded-br-none'
                  : 'bg-white text-gray-800 rounded-bl-none'
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="bg-white p-4 shadow-t-lg rounded-t-lg">
        <div className="flex items-center space-x-3">
          <input
            type="text"
            className="flex-1 p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
            placeholder="Ask your dHeliosAI Companion..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') sendMessage();
            }}
            disabled={isLoading || !isAuthReady}
          />
          <button
            onClick={sendMessage}
            className={`px-6 py-3 rounded-full font-semibold transition duration-300 transform ${
              input.trim() === '' || isLoading || !isAuthReady
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:scale-105'
            }`}
            disabled={input.trim() === '' || isLoading || !isAuthReady}
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
