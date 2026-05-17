import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import QRCode from "qrcode";
import DocRegistry from "./artifacts/contracts/DocRegistry.sol/DocRegistry.json";
import "./App.css";

const contractAddress = "0x14A7ba4122327038947a7FF4B2a1878D51d53920";

function App() {
  const [issuedDocs, setIssuedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedDocCID, setSelectedDocCID] = useState("");
  const [qrCodeURL, setQrCodeURL] = useState("");

  const [currentSection, setCurrentSection] = useState("home");

  const [step, setStep] = useState("selectRole");
  const [role, setRole] = useState(null);
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);

  const [file, setFile] = useState(null);
  const [fileHash32, setFileHash32] = useState("");

  const [fetchedDoc, setFetchedDoc] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [roleStatus, setRoleStatus] = useState(null);

  // ⚠️ FIX: safe env usage (Vercel + CRA)
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
  const RPC_URL = process.env.REACT_APP_SEPOLIA_RPC_URL || "";

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // ---------------- QR ----------------
  async function openQRModal(cid) {
    setSelectedDocCID(cid);
    const url = `https://ipfs.io/ipfs/${cid}`;

    try {
      const qrDataURL = await QRCode.toDataURL(url, {
        width: 200,
        margin: 2,
      });

      setQrCodeURL(qrDataURL);
      setShowQRModal(true);
    } catch (err) {
      console.error("QR error:", err);
    }
  }

  function closeQRModal() {
    setShowQRModal(false);
    setSelectedDocCID("");
    setQrCodeURL("");
  }

  // ---------------- CONTRACT INIT ----------------
  useEffect(() => {
    if (!provider) return;

    if (signer) {
      const c = new ethers.Contract(contractAddress, DocRegistry.abi, signer);
      setContract(c);

      signer.getAddress().then(async (addr) => {
        setAccount(addr);

        try {
          const isAdmin = await c.isAdmin?.(addr);
          const isIssuer = await c.isIssuer?.(addr);

          setRoleStatus({
            isAdmin: !!isAdmin,
            isIssuer: !!isIssuer,
          });
        } catch (err) {
          console.log("Role check fallback:", err);
          setRoleStatus({ isAdmin: false, isIssuer: true });
        }
      });
    } else {
      const c = new ethers.Contract(contractAddress, DocRegistry.abi, provider);
      setContract(c);
      setAccount(null);
      setRoleStatus(null);
    }
  }, [signer, provider]);

  // ---------------- FETCH DOCS (FIXED) ----------------
  const fetchIssuedDocuments = useCallback(async () => {
    if (!contract) return;

    setLoadingDocs(true);

    try {
      const hashes = await contract.getAllIssuedDocuments();

      const docs = await Promise.all(
        hashes.map(async (hash) => {
          const r = await contract.getDocument(hash);

          return {
            hash,
            issuer: r[0],
            fileName: r[1],
            cid: r[2],
            issuedAt: new Date(Number(r[3]) * 1000).toLocaleString(),
            revoked: r[4],
          };
        })
      );

      setIssuedDocs(docs);
    } catch (err) {
      console.error(err);
      setError("Failed to load documents");
    } finally {
      setLoadingDocs(false);
    }
  }, [contract]);

  useEffect(() => {
    if (role === "user" && step === "options") {
      fetchIssuedDocuments();
    }
  }, [role, step, fetchIssuedDocuments]);

  // ---------------- WALLET ----------------
  async function connectWallet() {
    if (!window.ethereum) {
      alert("MetaMask not found");
      return;
    }

    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const walletProvider = new ethers.BrowserProvider(window.ethereum);
      const walletSigner = await walletProvider.getSigner();

      setSigner(walletSigner);
      setStep("options");
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Wallet connection failed");
    }
  }

  // ---------------- FILE HASH ----------------
  async function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;

    setFile(f);

    const buffer = await f.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);

    const hex = [...new Uint8Array(hashBuffer)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    setFileHash32("0x" + hex.slice(0, 64));
  }

  // ---------------- ISSUE DOC ----------------
  async function issueDocument() {
    if (!file || !fileHash32) {
      setError("Select a file first");
      return;
    }

    setIsLoading(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      const tx = await contract.issueDocument(
        fileHash32,
        file.name,
        data.cid
      );

      await tx.wait();

      alert("Document issued successfully");
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------- UI ----------------
  return (
    <div className="App">
      <h1>DocVerify</h1>

      {!signer ? (
        <button onClick={connectWallet}>Connect Wallet</button>
      ) : (
        <div>
          <input type="file" onChange={handleFileChange} />
          <button onClick={issueDocument}>Issue</button>
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

export default App;