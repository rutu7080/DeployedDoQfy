import React, { useState, useEffect, useMemo } from "react";
import { ethers } from "ethers";
import QRCodeLib from "qrcode";
import DocRegistry from "./artifacts/contracts/DocRegistry.sol/DocRegistry.json";
import "./App.css";

// ✅ Hardcoded contract address (safe to expose — it's public on-chain)
const contractAddress = "0x40A667b5b1B28CD72FBe75B93df56696D8056032";

// ✅ Public Sepolia RPC — no env variable needed in React frontend
// SEPOLIA_RPC_URL is backend/Hardhat only and cannot be accessed here
const PUBLIC_SEPOLIA_RPC = "https://rpc.sepolia.org";

// ✅ Only REACT_APP_ prefixed variables are accessible in React
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [message, setMessage] = useState("");
  const [issuedDocs, setIssuedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // QR Modal state
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedDocCID, setSelectedDocCID] = useState("");
  const [qrCodeURL, setQrCodeURL] = useState("");

  // Navigation state
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

  // ✅ Read-only provider using public Sepolia RPC
  // SEPOLIA_RPC_URL from .env is NOT accessible in React (no REACT_APP_ prefix)
  const readOnlyProvider = useMemo(
    () => new ethers.JsonRpcProvider(PUBLIC_SEPOLIA_RPC),
    []
  );

  // ─────────────────────────────────────────────
  // QR Modal
  // ─────────────────────────────────────────────
  async function openQRModal(cid) {
    setSelectedDocCID(cid);
    const url = `https://ipfs.io/ipfs/${cid}`;
    try {
      const qrDataURL = await QRCodeLib.toDataURL(url, {
        width: 200,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrCodeURL(qrDataURL);
      setShowQRModal(true);
    } catch (err) {
      console.error("Error generating QR code:", err);
    }
  }

  function closeQRModal() {
    setShowQRModal(false);
    setSelectedDocCID("");
    setQrCodeURL("");
  }

  // ─────────────────────────────────────────────
  // Contract setup whenever signer changes
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (signer) {
      // ✅ Wallet-connected contract (can write)
      const c = new ethers.Contract(contractAddress, DocRegistry.abi, signer);
      setContract(c);

      signer.getAddress().then(async (addr) => {
        setAccount(addr);
        try {
          if (c.isAdmin && c.isIssuer) {
            const isAdmin = await c.isAdmin(addr);
            const isIssuer = await c.isIssuer(addr);
            setRoleStatus({ isAdmin, isIssuer });
            console.log("✅ Role check successful:", { isAdmin, isIssuer });
          } else {
            console.log("❌ Role check functions not available");
            setRoleStatus({ isAdmin: false, isIssuer: true });
          }
        } catch (err) {
          console.error("Error checking roles:", err);
          setRoleStatus({ isAdmin: false, isIssuer: true });
        }
      });
    } else {
      // ✅ Read-only contract using public RPC (no SEPOLIA_RPC_URL needed)
      const c = new ethers.Contract(
        contractAddress,
        DocRegistry.abi,
        readOnlyProvider
      );
      setContract(c);
      setAccount(null);
      setRoleStatus(null);
    }
  }, [signer, readOnlyProvider]);

  // ─────────────────────────────────────────────
  // Auto-fetch docs for User role
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (role === "user" && step === "options" && contract) {
      fetchIssuedDocuments();
    }
  }, [role, step, contract]);

  // ─────────────────────────────────────────────
  // Fetch all issued documents (read-only)
  // ─────────────────────────────────────────────
  async function fetchIssuedDocuments() {
    if (!contract) return;
    setLoadingDocs(true);
    setError(null);
    try {
      const hashes = await contract.getAllIssuedDocuments();
      const docs = await Promise.all(
        hashes.map(async (hash) => {
          try {
            const result = await contract.getDocument(hash);
            const issuer   = result[0];
            const fileName = result[1];
            const ipfsUri  = result[2];
            const issuedAt = result[3];
            const revoked  = result[4];
            return {
              hash, issuer, fileName,
              cid: ipfsUri,
              issuedAt: new Date(Number(issuedAt) * 1000).toLocaleString(),
              revoked,
            };
          } catch {
            return null;
          }
        })
      );
      setIssuedDocs(docs.filter(Boolean));
    } catch (err) {
      console.error("Failed to fetch issued documents:", err);
      setError("Failed to load issued documents");
    } finally {
      setLoadingDocs(false);
    }
  }

  // ─────────────────────────────────────────────
  // Network helpers
  // ─────────────────────────────────────────────
  async function switchToSepoliaNetwork() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0xaa36a7",
                chainName: "Sepolia Testnet",
                nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
                rpcUrls: [PUBLIC_SEPOLIA_RPC],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } catch (addError) {
          console.error("Failed to add Sepolia network:", addError);
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // Connect wallet
  // ─────────────────────────────────────────────
  async function connectWallet() {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install it from metamask.io");
      return;
    }
    try {
      await switchToSepoliaNetwork();
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const walletProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await walletProvider.getNetwork();

      if (network.chainId !== 11155111n) {
        alert("Please switch to Sepolia Testnet in MetaMask.");
        return;
      }

      const walletSigner = await walletProvider.getSigner();
      setSigner(walletSigner);
      setStep("options");
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Wallet connection failed or rejected.");
    }
  }

  // ─────────────────────────────────────────────
  // Check roles
  // ─────────────────────────────────────────────
  async function checkRoles() {
    if (!contract || !account) return;
    try {
      let roleInfo = `🔍 Role Check Results:\n\nAccount: ${account}\n`;
      if (contract.isAdmin && contract.isIssuer) {
        const isAdmin  = await contract.isAdmin(account);
        const isIssuer = await contract.isIssuer(account);
        roleInfo += `Is Admin:  ${isAdmin  ? "✅" : "❌"}\n`;
        roleInfo += `Is Issuer: ${isIssuer ? "✅" : "❌"}\n`;
        roleInfo += "\n✅ Contract functions are available!";
        if (fileHash32 && contract.hasDocument) {
          const hasDoc = await contract.hasDocument(fileHash32);
          roleInfo += `\nDocument exists: ${hasDoc ? "✅" : "❌"}`;
        }
      } else {
        roleInfo += "⚠️ Using older contract — role check not available.";
      }
      alert(roleInfo);
    } catch (err) {
      console.error("Role check failed:", err);
      setError("Role check failed: " + err.message);
    }
  }

  // ─────────────────────────────────────────────
  // File selection & hashing
  // ─────────────────────────────────────────────
  async function handleFileChange(e) {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    try {
      setFile(selectedFile);
      const arrayBuffer = await selectedFile.arrayBuffer();
      const hashBuffer  = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray   = Array.from(new Uint8Array(hashBuffer));
      const hashHex     = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      setFileHash32("0x" + hashHex.slice(0, 64));
      setError(null);
      setFetchedDoc(null);
    } catch (err) {
      setError("Error processing file: " + err.message);
    }
  }

  // ─────────────────────────────────────────────
  // Issue document
  // ─────────────────────────────────────────────
  async function issueDocument() {
    if (!file || !fileHash32) { setError("Please select a file first."); return; }
    if (!BACKEND_URL) { setError("Backend URL not configured. Check REACT_APP_BACKEND_URL in .env"); return; }

    setIsLoading(true);
    setError(null);

    try {
      // ✅ Upload to IPFS via backend (backend uses PINATA_JWT from its own .env)
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);

      const data = await res.json();

      if (!data.cid) throw new Error("No CID returned from backend. Check Pinata configuration.");

      console.log("Issuing document:", fileHash32, file.name, "CID:", data.cid);

      // ✅ Write to blockchain using MetaMask signer (wallet pays gas)
      const tx = await contract.issueDocument(fileHash32, file.name, data.cid);
      console.log("Transaction sent:", tx.hash);

      const receipt = await tx.wait();
      console.log("Confirmed in block:", receipt.blockNumber);

      const ipfsLink = `https://ipfs.io/ipfs/${data.cid}`;
      setMessage(ipfsLink);

      alert(
        `✅ Document Issued Successfully!\n\n` +
        `File: ${file.name}\n` +
        `Hash: ${fileHash32}\n` +
        `IPFS: ${ipfsLink}\n` +
        `Transaction: ${tx.hash}\n` +
        `Block: ${receipt.blockNumber}`
      );
    } catch (err) {
      console.error("Issue failed:", err);
      if (err.message.includes("Already issued")) {
        alert(`✅ Document Already Exists!\n\nFile: ${file.name}\nUse 'Verify Document' to check its status.`);
      } else {
        setError("Issue failed: " + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  // ─────────────────────────────────────────────
  // Revoke document
  // ─────────────────────────────────────────────
  async function revokeDocument() {
    if (!fileHash32) { setError("Please select a file first."); return; }
    setIsLoading(true);
    setError(null);
    try {
      const tx = await contract.revokeDocument(fileHash32);
      await tx.wait();
      alert(`✅ Document Revoked!\n\nFile: ${file.name}\nHash: ${fileHash32}`);
    } catch (err) {
      console.error("Revoke failed:", err);
      setError("Revoke failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  // ─────────────────────────────────────────────
  // View document (issuer)
  // ─────────────────────────────────────────────
  async function viewDocument() {
    if (!fileHash32) { setError("Please select a file first."); return; }
    setIsLoading(true);
    setError(null);
    setFetchedDoc(null);
    try {
      const [issuer, fileName, ipfsUri, issuedAt, revoked] = await contract.getDocument(fileHash32);
      if (issuer === "0x0000000000000000000000000000000000000000") {
        setError(`❌ Document Not Found\n\nNot issued yet.\nFile: ${file.name}\nHash: ${fileHash32.slice(0, 16)}...${fileHash32.slice(-16)}`);
        return;
      }
      const issuedAtNumber = Number(issuedAt);
      setFetchedDoc({
        issuer, fileName, ipfsUri,
        issuedAt: issuedAtNumber === 0 ? "Unknown" : new Date(issuedAtNumber * 1000).toLocaleString(),
        revoked,
      });
    } catch (err) {
      console.error("View failed:", err);
      setError("View failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  // ─────────────────────────────────────────────
  // Verify document (verifier — read-only, no wallet needed)
  // ─────────────────────────────────────────────
  async function verifyFile() {
    if (!file) { setError("Please select a file to verify."); return; }
    setIsLoading(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer  = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray   = Array.from(new Uint8Array(hashBuffer));
      const hashHex     = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      const hash32      = "0x" + hashHex.slice(0, 64);

      console.log("Verifying hash:", hash32);

      // ✅ Use public RPC for read-only verification — no wallet or env variable needed
      const verifyProvider = new ethers.JsonRpcProvider(PUBLIC_SEPOLIA_RPC);
      const readOnlyContract = new ethers.Contract(
        contractAddress,
        DocRegistry.abi,
        verifyProvider
      );

      const [issuer, fileName, ipfsUri, issuedAt, revoked] =
        await readOnlyContract.getDocument(hash32);

      if (issuer === "0x0000000000000000000000000000000000000000") {
        alert(
          `❌ DOCUMENT NOT FOUND\n\n` +
          `File: ${file.name}\n` +
          `Hash: ${hash32}\n\n` +
          `This document was not issued or doesn't exist on the blockchain.`
        );
      } else {
        const issuedDate =
          Number(issuedAt) === 0
            ? "Unknown"
            : new Date(Number(issuedAt) * 1000).toLocaleString();
        const status = revoked ? "❌ REVOKED" : "✅ VALID";
        alert(
          `✅ DOCUMENT VERIFIED!\n\n` +
          `File: ${file.name}\n` +
          `Status: ${status}\n` +
          `Issuer: ${issuer}\n` +
          `Original Name: ${fileName}\n` +
          `IPFS CID: ${ipfsUri}\n` +
          `Issued: ${issuedDate}\n` +
          `Hash: ${hash32}`
        );
      }
    } catch (err) {
      console.error("Verify failed:", err);
      // ✅ Handle "Document not found" revert from contract gracefully
      if (err.message.includes("Document not found")) {
        alert(`❌ DOCUMENT NOT FOUND\n\nFile: ${file.name}\n\nThis document has not been issued on the blockchain.`);
      } else {
        setError("Verify failed: " + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  // ─────────────────────────────────────────────
  // Logout / reset
  // ─────────────────────────────────────────────
  function handleLogout() {
    setAccount(null);
    setSigner(null);
    setFile(null);
    setFileHash32("");
    setError(null);
    setIsLoading(false);
    setRole(null);
    setStep("selectRole");
    setFetchedDoc(null);
    setRoleStatus(null);
    setIssuedDocs([]);
    setMessage("");
  }

  // ─────────────────────────────────────────────
  // Role colors
  // ─────────────────────────────────────────────
  const roleColors = {
    issuer:   { bg: "#10b981", glow: "rgba(16,185,129,0.35)" },
    user:     { bg: "#667eea", glow: "rgba(102,126,234,0.35)" },
    verifier: { bg: "#f59e0b", glow: "rgba(245,158,11,0.35)" },
  };

  // ═══════════════════════════════════════════════
  // RENDER: Role Selection
  // ═══════════════════════════════════════════════
  if (step === "selectRole") {
    return (
      <div className="App">
        <nav className="navbar">
          <div className="navbar-container">
            <div className="navbar-logo">🔰 DocVerify</div>
            <div className="navbar-menu">
              <button className={`nav-item ${currentSection === "home"         ? "active" : ""}`} onClick={() => setCurrentSection("home")}>Home</button>
              <button className={`nav-item ${currentSection === "technologies" ? "active" : ""}`} onClick={() => setCurrentSection("technologies")}>Technologies</button>
              <button className={`nav-item ${currentSection === "projects"     ? "active" : ""}`} onClick={() => setCurrentSection("projects")}>Projects</button>
              <button className={`nav-item ${currentSection === "about"        ? "active" : ""}`} onClick={() => setCurrentSection("about")}>About Us</button>
            </div>
          </div>
        </nav>

        {currentSection === "home" && (
          <div className="home-section">
            <div className="hero-content">
              <h1 className="hero-title">Blockchain Document Verification System</h1>
              <p className="hero-subtitle">Secure, immutable document verification on the blockchain</p>
            </div>
            <div className="role-selection-container">
              <h3 className="role-selection-header">Select your role:</h3>
              <div className="role-cards-grid">
                <button className="role-card role-issuer hover-lift" onClick={() => { setRole("issuer"); setStep("connect"); }}>
                  <div className="role-card-icon">🏛️</div>
                  <div className="role-card-title">Issuer</div>
                  <div className="role-card-description">Issue &amp; manage documents</div>
                </button>
                <button className="role-card role-user hover-lift" onClick={() => { setRole("user"); setStep("connect"); }}>
                  <div className="role-card-icon">👩🏽‍🎓</div>
                  <div className="role-card-title">User</div>
                  <div className="role-card-description">View document details</div>
                </button>
                <button className="role-card role-verifier hover-lift" onClick={() => { setRole("verifier"); setStep("connect"); }}>
                  <div className="role-card-icon">🔍</div>
                  <div className="role-card-title">Verifier</div>
                  <div className="role-card-description">Verify document authenticity</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {currentSection === "technologies" && (
          <div className="glass-container">
            <h1 style={{ textAlign: "center", marginBottom: "10px" }}>Technologies</h1>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", marginBottom: "8px", fontSize: "0.95rem" }}>Powered by cutting-edge decentralized tech</p>
            <div className="tech-grid">
              <div className="tech-card">
                <div className="tech-icon"><img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Ethereum_logo_2014.svg" alt="Ethereum" style={{ width: "60px", height: "60px" }} /></div>
                <h3>Blockchain</h3>
                <p>Ethereum blockchain for immutable and transparent document storage</p>
              </div>
              <div className="tech-card">
                <div className="tech-icon"><img src="https://upload.wikimedia.org/wikipedia/commons/1/18/Ipfs-logo-1024-ice-text.png" alt="IPFS" style={{ width: "60px", height: "60px" }} /></div>
                <h3>IPFS</h3>
                <p>Decentralized file storage using InterPlanetary File System</p>
              </div>
              <div className="tech-card"><div className="tech-icon">⚛️</div><h3>React</h3><p>Modern frontend framework for building interactive user interfaces</p></div>
              <div className="tech-card"><div className="tech-icon">📜</div><h3>Smart Contracts</h3><p>Solidity-based smart contracts with role-based access control</p></div>
              <div className="tech-card"><div className="tech-icon">🦊</div><h3>MetaMask</h3><p>Web3 wallet integration for secure blockchain interactions</p></div>
              <div className="tech-card"><div className="tech-icon">🔐</div><h3>Cryptography</h3><p>SHA-256 hashing for document integrity verification</p></div>
            </div>
          </div>
        )}

        {currentSection === "projects" && (
          <div className="glass-container">
            <h1 style={{ textAlign: "center", marginBottom: "10px" }}>Projects</h1>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", marginBottom: "8px", fontSize: "0.95rem" }}>Open-source blockchain tools &amp; demos</p>
            <div className="projects-container">
              <div className="project-card">
                <div className="project-header"><h3>⛓️ Blockchain Demo</h3><span className="project-badge">Live</span></div>
                <p>An interactive blockchain visualization tool that demonstrates how blockchain technology works.</p>
                <div className="project-features">
                  <div className="feature-tag">🔗 Block Creation</div>
                  <div className="feature-tag">🔐 SHA-256 Hashing</div>
                  <div className="feature-tag">⛏️ Mining Simulation</div>
                  <div className="feature-tag">📊 Chain Validation</div>
                </div>
                <div className="project-links">
                  <a href="https://blockchain-demo-k4ex.onrender.com/" target="_blank" rel="noopener noreferrer" className="project-link live-link">🌐 View Live Demo</a>
                  <a href="https://github.com/rutu7080/Blockchain-Demo" target="_blank" rel="noopener noreferrer" className="project-link github-link">💻 View on GitHub</a>
                </div>
              </div>
              <div className="project-card">
                <div className="project-header"><h3>🔑 Public-Private Key Demo</h3><span className="project-badge">Live</span></div>
                <p>An interactive cryptography demonstration tool that visualizes how public-private key encryption works.</p>
                <div className="project-features">
                  <div className="feature-tag">🔐 Key Generation</div>
                  <div className="feature-tag">📝 Digital Signatures</div>
                  <div className="feature-tag">🔒 Encryption/Decryption</div>
                  <div className="feature-tag">✅ Signature Verification</div>
                </div>
                <div className="project-links">
                  <a href="https://public-private-key-demo-42gw.onrender.com" target="_blank" rel="noopener noreferrer" className="project-link live-link">🌐 View Live Demo</a>
                  <a href="https://github.com/rutu7080/public-private-key-Demo" target="_blank" rel="noopener noreferrer" className="project-link github-link">💻 View on GitHub</a>
                </div>
              </div>
              <div className="project-card">
                <div className="project-header"><h3>📦 IPFS File System</h3><span className="project-badge in-development">In Development</span></div>
                <p>A decentralized file storage system built on IPFS without relying on centralized servers.</p>
                <div className="project-features">
                  <div className="feature-tag">📤 File Upload</div>
                  <div className="feature-tag">🌐 IPFS Integration</div>
                  <div className="feature-tag">🔗 Content Addressing</div>
                  <div className="feature-tag">💾 Decentralized Storage</div>
                </div>
                <div className="project-links">
                  <a href="https://github.com/rutu7080/IPFS-File-System" target="_blank" rel="noopener noreferrer" className="project-link github-link github-only">💻 View on GitHub</a>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentSection === "about" && (
          <div className="glass-container">
            <h1 style={{ textAlign: "center", marginBottom: "10px" }}>About Us</h1>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", marginBottom: "8px", fontSize: "0.95rem" }}>Building the future of document trust</p>
            <div className="about-content">
              <div className="about-section"><h3>🎯 Our Mission</h3><p>To revolutionize document verification by leveraging blockchain technology, ensuring transparency, security, and immutability for critical documents worldwide.</p></div>
              <div className="about-section"><h3>💡 Our Vision</h3><p>A world where document fraud is eliminated, and verification is instant, secure, and accessible to everyone through decentralized technology.</p></div>
              <div className="about-section"><h3>⚡ What We Do</h3><p>We provide a blockchain-based platform that allows organizations to issue verifiable documents and enables anyone to instantly verify document authenticity without relying on centralized authorities.</p></div>
              <div className="about-section">
                <h3>🌟 Key Features</h3>
                <ul className="features-list">
                  <li>✅ Immutable document records on Ethereum blockchain</li>
                  <li>✅ Decentralized storage using IPFS</li>
                  <li>✅ Role-based access control for issuers and verifiers</li>
                  <li>✅ QR code generation for easy verification</li>
                  <li>✅ Instant document status checking (Valid/Revoked)</li>
                  <li>✅ Cryptographic proof of authenticity</li>
                </ul>
              </div>
              <div className="about-section">
                <h3>📧 Contact Us</h3>
                <div className="contact-info">
                  <p><span className="contact-icon">📧</span><strong>Email:</strong>{" "}<a href="mailto:ruturajdeshmukh23@gmail.com" className="contact-link">ruturajdeshmukh23@gmail.com</a></p>
                  <p><span className="contact-icon">💻</span><strong>GitHub:</strong>{" "}<a href="https://github.com/rutu7080" target="_blank" rel="noopener noreferrer" className="contact-link">github.com/rutu7080</a></p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // RENDER: Connect Wallet
  // ═══════════════════════════════════════════════
  if (step === "connect") {
    const rc = roleColors[role] || roleColors.user;
    return (
      <div className="App">
        <div className="glass-container" style={{ textAlign: "center" }}>
          <h2 style={{ marginBottom: "6px" }}>Connect Wallet</h2>
          <p style={{ color: "rgba(255,255,255,0.45)", marginBottom: "24px", fontSize: "0.92rem" }}>Authenticate with MetaMask to continue</p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", backgroundColor: rc.bg + "22", color: "#fff", padding: "8px 20px", borderRadius: "20px", border: `1px solid ${rc.bg}55`, marginBottom: "28px", fontWeight: "700", fontSize: "0.88rem", letterSpacing: "0.06em", textTransform: "uppercase", boxShadow: `0 0 20px ${rc.glow}` }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: rc.bg, display: "inline-block", boxShadow: `0 0 8px ${rc.bg}` }}></span>
            Role: {role}
          </div>

          {/* ✅ Show backend URL status for debugging */}
          {!BACKEND_URL && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px", marginBottom: "16px", color: "#fca5a5", fontSize: "0.85rem" }}>
              ⚠️ <strong>REACT_APP_BACKEND_URL</strong> is not set in your .env file.<br/>
              Document issuing will not work without it.
            </div>
          )}

          {account ? (
            <div className="info-card" style={{ textAlign: "left" }}>
              <p style={{ color: "#6ee7b7", fontWeight: "700", fontSize: "1rem", marginBottom: "10px" }}>✅ Connected successfully</p>
              <code className="blockchain-hash">{account}</code>
              {roleStatus && (
                <div className="role-status">
                  <span>Admin: {roleStatus.isAdmin ? "✅" : "❌"}</span>
                  <span>Issuer: {roleStatus.isIssuer ? "✅" : "❌"}</span>
                </div>
              )}
              <div style={{ textAlign: "center", marginTop: "16px" }}>
                <button className="hover-lift" onClick={() => setStep("options")} style={{ padding: "13px 28px", background: "linear-gradient(135deg, #10b981, #059669)", color: "white", borderRadius: "12px", fontWeight: "700", fontSize: "0.95rem" }}>
                  Continue →
                </button>
              </div>
            </div>
          ) : (
            <button className="hover-lift" onClick={connectWallet} style={{ padding: "16px 36px", fontSize: "1rem", margin: "20px auto", display: "block", background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)", color: "white", borderRadius: "14px", fontWeight: "700", letterSpacing: "0.02em", boxShadow: "0 8px 30px rgba(245,158,11,0.35)" }}>
              🦊 Connect MetaMask Wallet
            </button>
          )}

          {error && (
            <div className="message-box error" style={{ marginTop: "16px" }}>
              <strong>❌ Error:</strong> {error}
            </div>
          )}

          <br />
          <button onClick={() => { setStep("selectRole"); setError(null); }} style={{ padding: "10px 22px", fontSize: "0.88rem", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", borderRadius: "10px", marginTop: "12px", border: "1px solid rgba(255,255,255,0.1)" }}>
            ← Back to Role Selection
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // RENDER: Main Options Panel
  // ═══════════════════════════════════════════════
  if (step === "options") {
    const rc = roleColors[role] || roleColors.user;
    return (
      <div className="App">
        <div className="glass-container">
          <h2 style={{ textAlign: "center", marginBottom: "6px" }}>🔐 Document Verification System</h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", marginBottom: "28px", fontSize: "0.92rem" }}>Manage and verify documents on-chain</p>

          {/* Info Card */}
          <div className="info-card">
            <p><strong>Contract:</strong> <code>{contractAddress}</code></p>
            <p><strong>Account:</strong> <code>{account ? `${account.slice(0, 8)}...${account.slice(-6)}` : "Not connected"}</code></p>
            <p><strong>Network:</strong> <span style={{ color: "#6ee7b7" }}>Sepolia Testnet</span></p>
            <p style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <strong>Role:</strong>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: rc.bg + "22", color: "#fff", padding: "5px 14px", borderRadius: "20px", border: `1px solid ${rc.bg}55`, fontWeight: "700", fontSize: "0.82rem", letterSpacing: "0.06em", textTransform: "uppercase", boxShadow: `0 0 14px ${rc.glow}` }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: rc.bg, display: "inline-block" }}></span>
                {role}
              </span>
            </p>
            {/* ✅ Show backend URL warning */}
            {!BACKEND_URL && role === "issuer" && (
              <p style={{ color: "#fca5a5", fontSize: "0.82rem", marginTop: "8px" }}>
                ⚠️ REACT_APP_BACKEND_URL not set — document issuing will fail.
              </p>
            )}
          </div>

          {/* File Selection (not for user role) */}
          {role !== "user" && (
            <div className="issued-documents-section">
              <h3 style={{ textAlign: "center", marginBottom: "20px" }}>📁 File Selection</h3>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                <div className="file-upload-wrapper">
                  <label className={`file-upload-label ${file ? "has-file" : ""}`} htmlFor="file-input">
                    <span style={{ fontSize: "1.8rem" }}>{file ? "📄" : "📁"}</span>
                    <span>{file ? file.name : "Choose File to Upload"}</span>
                  </label>
                  <input id="file-input" type="file" onChange={handleFileChange} disabled={isLoading} />
                </div>
              </div>
              <div className="hash-display">
                <strong style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Document Hash (SHA-256)</strong><br />
                <span style={{ marginTop: "6px", display: "block" }}>
                  {fileHash32 ? `${fileHash32.slice(0, 16)}...${fileHash32.slice(-16)}` : "— No file selected —"}
                </span>
              </div>
            </div>
          )}

          {/* Error / Success */}
          {error && (
            <div className={`message-box ${error.includes("✅") ? "success" : "error"}`}>
              <strong>{error.includes("✅") ? "✅ Success:" : "❌ Error:"}</strong><br />{error}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="loading-container transaction-pending">
              <div className="spinner"></div>
              <p style={{ color: "#a78bfa", fontWeight: "600", fontSize: "0.95rem" }}>⏳ Processing transaction...</p>
            </div>
          )}

          {/* Issuer: role check */}
          {role === "issuer" && (
            <div className="info-card" style={{ background: "rgba(139,92,246,0.06)", borderColor: "rgba(139,92,246,0.15)" }}>
              <h4 style={{ textAlign: "center", marginBottom: "14px" }}>🔑 Role Check</h4>
              <div style={{ textAlign: "center" }}>
                <button className="hover-lift" onClick={checkRoles} disabled={isLoading} style={{ padding: "11px 24px", background: "rgba(139,92,246,0.15)", color: "#c4b5fd", borderRadius: "10px", border: "1px solid rgba(139,92,246,0.3)", fontSize: "0.92rem" }}>
                  🔍 Check My Roles &amp; Contract Status
                </button>
              </div>
              <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", marginTop: "10px", textAlign: "center" }}>Check your permissions and contract version</p>
            </div>
          )}

          {/* Action Buttons */}
          {role !== "user" && (
            <div className="info-card">
              <h4 style={{ textAlign: "center", marginBottom: "16px" }}>📋 Actions</h4>
              <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
                {role === "issuer" && (
                  <>
                    <button className="hover-lift" onClick={issueDocument} disabled={isLoading || !file} style={{ padding: "13px 26px", background: "linear-gradient(135deg, #10b981, #059669)", color: "white", borderRadius: "12px", fontSize: "0.95rem", fontWeight: "700", boxShadow: "0 6px 20px rgba(16,185,129,0.3)" }}>📝 Issue Document</button>
                    <button className="hover-lift" onClick={revokeDocument} disabled={isLoading || !file} style={{ padding: "13px 26px", background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "white", borderRadius: "12px", fontSize: "0.95rem", fontWeight: "700", boxShadow: "0 6px 20px rgba(239,68,68,0.3)" }}>❌ Revoke Document</button>
                    <button className="hover-lift" onClick={viewDocument} disabled={isLoading || !file} style={{ padding: "13px 26px", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", borderRadius: "12px", fontSize: "0.95rem", fontWeight: "700", boxShadow: "0 6px 20px rgba(102,126,234,0.3)" }}>👁️ View Document</button>
                  </>
                )}
                {role === "verifier" && (
                  <button className="hover-lift" onClick={verifyFile} disabled={isLoading || !file} style={{ padding: "13px 26px", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white", borderRadius: "12px", fontSize: "0.95rem", fontWeight: "700", boxShadow: "0 6px 20px rgba(245,158,11,0.3)" }}>🔍 Verify Document</button>
                )}
              </div>
            </div>
          )}

          {/* User: issued documents table */}
          {role === "user" && (
            <div className="issued-documents-section">
              <h3 style={{ textAlign: "center", marginBottom: "20px" }}>📚 Issued Documents</h3>
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <button onClick={fetchIssuedDocuments} disabled={loadingDocs} style={{ padding: "9px 20px", background: "rgba(102,126,234,0.15)", color: "#a5b4fc", border: "1px solid rgba(102,126,234,0.3)", borderRadius: "10px", fontSize: "0.88rem", fontWeight: "600" }}>
                  🔄 Refresh Documents
                </button>
              </div>
              {loadingDocs ? (
                <div className="loading-container"><div className="spinner"></div><p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>Loading documents...</p></div>
              ) : issuedDocs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "14px", opacity: 0.4 }}>📭</div>
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.95rem" }}>No documents issued yet.</p>
                </div>
              ) : (
                <table style={{ width: "100%", marginTop: "15px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr><th>File Name</th><th>CID</th><th>Status</th><th>View</th></tr>
                  </thead>
                  <tbody>
                    {issuedDocs.map((doc, i) => (
                      <tr key={i}>
                        <td>{doc.fileName || "Unknown"}</td>
                        <td>{doc.cid ? `${doc.cid.slice(0, 10)}…${doc.cid.slice(-6)}` : "N/A"}</td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 12px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: "700", background: doc.revoked ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)", color: doc.revoked ? "#fca5a5" : "#6ee7b7", border: `1px solid ${doc.revoked ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}` }}>
                            {doc.revoked ? "❌ Revoked" : "✅ Valid"}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => openQRModal(doc.cid)} style={{ padding: "7px 16px", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem", boxShadow: "0 4px 12px rgba(102,126,234,0.25)" }}>
                            View QR
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Logout */}
          <div style={{ textAlign: "center", marginTop: "28px" }}>
            <button
              onClick={handleLogout}
              style={{ padding: "12px 28px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", fontWeight: "600", fontSize: "0.9rem" }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)"; e.currentTarget.style.color = "#fca5a5"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
            >
              🚪 Logout
            </button>
          </div>

          {/* Document Details (after viewDocument) */}
          {fetchedDoc && (
            <div className="document-details">
              <h3 style={{ textAlign: "center", marginBottom: "20px", color: "#e2e8f0" }}>📄 Document Details</h3>
              <div style={{ display: "grid", gap: "10px" }}>
                <p><strong style={{ color: "rgba(255,255,255,0.7)" }}>🏢 Issuer:</strong> <code>{fetchedDoc.issuer}</code></p>
                <p><strong style={{ color: "rgba(255,255,255,0.7)" }}>📎 File Name:</strong> <span style={{ color: "rgba(255,255,255,0.65)" }}>{fetchedDoc.fileName}</span></p>
                <p><strong style={{ color: "rgba(255,255,255,0.7)" }}>🔗 IPFS CID:</strong> <code>{fetchedDoc.ipfsUri}</code></p>
                <p>
                  <strong style={{ color: "rgba(255,255,255,0.7)" }}>🔗 IPFS Link:</strong>{" "}
                  <a href={`https://ipfs.io/ipfs/${fetchedDoc.ipfsUri}`} target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa" }}>
                    Open on IPFS ↗
                  </a>
                </p>
                <p><strong style={{ color: "rgba(255,255,255,0.7)" }}>📅 Issued At:</strong> <span style={{ color: "rgba(255,255,255,0.65)" }}>{fetchedDoc.issuedAt}</span></p>
                <p style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <strong style={{ color: "rgba(255,255,255,0.7)" }}>📊 Status:</strong>
                  <span className={`status-badge ${fetchedDoc.revoked ? "revoked" : "valid"}`}>{fetchedDoc.revoked ? "❌ Revoked" : "✅ Valid"}</span>
                </p>
              </div>
            </div>
          )}

          {/* QR Modal */}
          {showQRModal && (
            <div className="qr-modal-overlay" onClick={closeQRModal}>
              <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="qr-modal-close" onClick={closeQRModal}>✕</button>
                <h3 style={{ textAlign: "center", marginBottom: "6px", color: "#e2e8f0" }}>📱 Document QR Code</h3>
                <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", marginBottom: "24px" }}>Scan to access on IPFS</p>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "22px", padding: "16px", background: "white", borderRadius: "16px", boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}>
                  {qrCodeURL && <img src={qrCodeURL} alt="QR Code" style={{ borderRadius: "8px", display: "block" }} />}
                </div>
                <div style={{ textAlign: "center", padding: "14px", background: "rgba(102,126,234,0.08)", borderRadius: "12px", border: "1px solid rgba(102,126,234,0.15)" }}>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", marginBottom: "8px" }}>OR OPEN DIRECTLY</p>
                  <a href={`https://ipfs.io/ipfs/${selectedDocCID}`} target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none", fontWeight: "700", fontSize: "0.95rem" }}>
                    🔗 Click here to open
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default App;