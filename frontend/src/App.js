import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import QRCodeLib from "qrcode";
import DocRegistry from "./artifacts/contracts/DocRegistry.sol/DocRegistry.json";
import "./App.css";

const contractAddress = "0x14A7ba4122327038947a7FF4B2a1878D51d53920";
//const localProviderUrl = "http://127.0.0.1:8545";

function App() {

  //const [file, setFile] = useState(null);
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
const provider = new ethers.JsonRpcProvider(
  process.env.SEPOLIA_RPC_URL
);
 const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

  async function openQRModal(cid) {
    setSelectedDocCID(cid);
    const url = `https://ipfs.io/ipfs/${cid}`;
    try {
      const qrDataURL = await QRCodeLib.toDataURL(url, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      setQrCodeURL(qrDataURL);
      setShowQRModal(true);
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  }

  function closeQRModal() {
    setShowQRModal(false);
    setSelectedDocCID("");
    setQrCodeURL("");
  }

  useEffect(() => {
    if (signer) {
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
            console.log("❌ Role check functions not available - using older contract version");
            setRoleStatus({ isAdmin: false, isIssuer: true });
          }
        } catch (err) {
          console.error("Error checking roles:", err);
          setRoleStatus({ isAdmin: false, isIssuer: true });
        }
      });
    } else {
      const c = new ethers.Contract(contractAddress, DocRegistry.abi, provider);
      setContract(c);
      setAccount(null);
      setRoleStatus(null);
    }
  }, [signer]);

  useEffect(() => {
    if (role === "user" && step === "options" && contract) {
      fetchIssuedDocuments();
    }
  }, [role, step, contract]);

  async function fetchIssuedDocuments() {
    if (!contract) return;
    setLoadingDocs(true);
    setError(null);
    try {
      const hashes = await contract.getAllIssuedDocuments();
      const docs = await Promise.all(
        hashes.map(async (hash) => {
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
        })
      );
      setIssuedDocs(docs);
    } catch (err) {
      console.error("Failed to fetch issued documents:", err);
      setError("Failed to load issued documents");
    } finally {
      setLoadingDocs(false);
    }
  }

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
              nativeCurrency: {
                name: "SepoliaETH",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://rpc.sepolia.org"],
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

  async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found in your browser.");
    return;
  }

  try {
    await switchToSepoliaNetwork();

    await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const walletProvider = new ethers.BrowserProvider(window.ethereum);

    const network = await walletProvider.getNetwork();

    if (network.chainId !== 11155111n) {
      alert("Please switch to Sepolia Testnet.");
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

  async function checkRoles() {
    if (!contract || !account) return;
    try {
      let roleInfo = "🔍 Role Check Results:\n\nAccount: " + account + "\n";
      if (contract.isAdmin && contract.isIssuer) {
        const isAdmin = await contract.isAdmin(account);
        const isIssuer = await contract.isIssuer(account);
        roleInfo += "Is Admin: " + (isAdmin ? "✅" : "❌") + "\n";
        roleInfo += "Is Issuer: " + (isIssuer ? "✅" : "❌") + "\n";
        roleInfo += "\n✅ Contract functions are available!";
        if (fileHash32 && contract.hasDocument) {
          const hasDoc = await contract.hasDocument(fileHash32);
          roleInfo += "\nDocument exists: " + (hasDoc ? "✅" : "❌");
        }
      } else {
        roleInfo += "⚠️ Using older contract version - role check functions not available\n\n";
        roleInfo += "Solution: Deploy updated contract and update contract address in React app.";
      }
      alert(roleInfo);
    } catch (err) {
      console.error("Role check failed:", err);
      setError("Role check failed: " + err.message);
    }
  }

  async function handleFileChange(e) {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    try {
      setFile(selectedFile);
      const arrayBuffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      setFileHash32("0x" + hashHex.slice(0, 64));
      console.log("File hash calculated:", "0x" + hashHex.slice(0, 64));
      setError(null);
      setFetchedDoc(null);
    } catch (err) {
      setError("Error processing file: " + err.message);
    }
  }

  async function issueDocument() {
    if (!file || !fileHash32) { setError("Please select a file first."); return; }
    setIsLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BACKEND_URL}/upload`, { method: "POST", body: formData });
    const data = await res.json();
    try {
      console.log("Issuing document:", fileHash32, file.name);
      const tx = await contract.issueDocument(fileHash32, file.name, data.cid);
      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transaction confirmed in block:", receipt.blockNumber);
      if (data.error) alert(data.error);
      else if (data.cid) { const link1 = "https://ipfs.io/ipfs/" + data.cid; setMessage(link1); }
      else { console.warn("No CID returned from backend"); }
      alert(`✅ Document Issued Successfully!\n\nFile: ${file.name}\nHash: ${fileHash32}\nTransaction: ${tx.hash}\nBlock: ${receipt.blockNumber}`);
    } catch (err) {
      console.error("Issue failed:", err);
      if (err.message.includes("Already issued")) {
        alert(`✅ Document Already Exists!\n\nFile: ${file.name}\nThis document was already issued. Use 'Verify Document' to check its status.`);
      } else {
        setError("Issue failed: " + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

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

  async function viewDocument() {
    if (!fileHash32) { setError("Please select a file first."); return; }
    setIsLoading(true);
    setError(null);
    setFetchedDoc(null);
    try {
      const [issuer, fileName, ipfsUri, issuedAt, revoked] = await contract.getDocument(fileHash32);
      const issuedAtNumber = Number(issuedAt);
      if (issuer === "0x0000000000000000000000000000000000000000") {
        setError(`❌ Document Not Found\n\nThis document has not been issued by any authorized issuer.\n\nFile: ${file.name}\nHash: ${fileHash32.slice(0, 16)}...${fileHash32.slice(-16)}\n\nTo issue this document, use the 'Issuer' role.`);
        return;
      }
      setFetchedDoc({
        issuer, fileName, ipfsUri,
        issuedAt: issuedAtNumber === 0 ? "Unknown" : new Date(issuedAtNumber * 1000).toLocaleString(),
        revoked,
      });
    } catch (err) {
      console.error("View failed:", err);
      setError("View failed: " + err.message);
      setFetchedDoc(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyFile() {
    if (!file) { setError("Please select a file to verify"); return; }
    setIsLoading(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      const hash32 = "0x" + hashHex.slice(0, 64);
      console.log("Verifying hash:", hash32);
      const readOnlyContract = new ethers.Contract(contractAddress, DocRegistry.abi, provider);
      const [issuer, fileName, ipfsUri, issuedAt, revoked] = await readOnlyContract.getDocument(hash32);
      console.log("Verification result:", { issuer, fileName, ipfsUri, issuedAt: issuedAt.toString(), revoked });
      if (issuer === "0x0000000000000000000000000000000000000000") {
        alert(`❌ DOCUMENT NOT FOUND\n\nFile: ${file.name}\nHash: ${hash32}\n\nThis document was not issued or doesn't exist in the blockchain.`);
      } else {
        const issuedAtNumber = Number(issuedAt);
        const issuedDate = issuedAtNumber === 0 ? "Unknown" : new Date(issuedAtNumber * 1000).toLocaleString();
        const status = revoked ? "❌ REVOKED" : "✅ VALID";
        alert(`✅ DOCUMENT VERIFIED!\n\nFile: ${file.name}\nStatus: ${status}\nIssuer: ${issuer}\nOriginal Name: ${fileName}\nIPFS CID: ${ipfsUri}\nIssued: ${issuedDate}\nHash: ${hash32}`);
      }
    } catch (err) {
      console.error("Verify failed:", err);
      setError("Verify failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const roleColors = {
    issuer:   { bg: "#10b981", glow: "rgba(16,185,129,0.35)" },
    user:     { bg: "#667eea", glow: "rgba(102,126,234,0.35)" },
    verifier: { bg: "#f59e0b", glow: "rgba(245,158,11,0.35)" },
  };

  if (step === "selectRole") {
    return (
      <div className="App">
        <nav className="navbar">
          <div className="navbar-container">
            <div className="navbar-logo">🔰 DocVerify</div>
            <div className="navbar-menu">
              <button className={`nav-item ${currentSection === 'home' ? 'active' : ''}`} onClick={() => setCurrentSection('home')}>Home</button>
              <button className={`nav-item ${currentSection === 'technologies' ? 'active' : ''}`} onClick={() => setCurrentSection('technologies')}>Technologies</button>
              <button className={`nav-item ${currentSection === 'projects' ? 'active' : ''}`} onClick={() => setCurrentSection('projects')}>Projects</button>
              <button className={`nav-item ${currentSection === 'about' ? 'active' : ''}`} onClick={() => setCurrentSection('about')}>About Us</button>
            </div>
          </div>
        </nav>

        {currentSection === 'home' && (
          <div className="home-section">
            <div className="hero-content">
              <h1 className="hero-title"> Blockchain Document Verification System</h1>
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

        {currentSection === 'technologies' && (
          <div className="glass-container">
            <h1 style={{ textAlign: "center", marginBottom: "10px" }}> Technologies</h1>
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

        {currentSection === 'projects' && (
          <div className="glass-container">
            <h1 style={{ textAlign: "center", marginBottom: "10px" }}> Projects</h1>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", marginBottom: "8px", fontSize: "0.95rem" }}>Open-source blockchain tools &amp; demos</p>
            <div className="projects-container">
              <div className="project-card">
                <div className="project-header"><h3>⛓️ Blockchain Demo</h3><span className="project-badge">Live</span></div>
                <p>An interactive blockchain visualization tool that demonstrates how blockchain technology works. This educational project helps users understand core blockchain concepts including blocks, hashing, mining, and distributed ledger technology through hands-on interaction.</p>
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
                <p>An interactive cryptography demonstration tool that visualizes how public-private key encryption works. This educational project helps users understand asymmetric encryption, digital signatures, and secure communication through practical examples and real-time visualization.</p>
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
                <p>A decentralized file storage system built on IPFS (InterPlanetary File System). This project demonstrates how to upload, store, and retrieve files in a distributed manner without relying on centralized servers, ensuring data permanence and availability.</p>
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

        {currentSection === 'about' && (
          <div className="glass-container">
            <h1 style={{ textAlign: "center", marginBottom: "10px" }}> About Us</h1>
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
            </div>
          ) : (
            <button className="hover-lift" onClick={connectWallet} style={{ padding: "16px 36px", fontSize: "1rem", margin: "20px auto", display: "block", background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)", color: "white", borderRadius: "14px", fontWeight: "700", letterSpacing: "0.02em", boxShadow: "0 8px 30px rgba(245,158,11,0.35)" }}>
              🦊 Connect MetaMask Wallet
            </button>
          )}
          <br />
          <button onClick={() => setStep("selectRole")} style={{ padding: "10px 22px", fontSize: "0.88rem", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", borderRadius: "10px", marginTop: "12px", border: "1px solid rgba(255,255,255,0.1)" }}>
            ← Back to Role Selection
          </button>
        </div>
      </div>
    );
  }

  if (step === "options") {
    const rc = roleColors[role] || roleColors.user;
    return (
      <div className="App">
        <div className="glass-container">
          <h2 style={{ textAlign: "center", marginBottom: "6px" }}>🔐 Document Verification System</h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", marginBottom: "28px", fontSize: "0.92rem" }}>Manage and verify documents on-chain</p>

          <div className="info-card">
            <p><strong>Contract:</strong> <code>{contractAddress}</code></p>
            <p><strong>Account:</strong> <code>{account ? `${account.slice(0,8)}...${account.slice(-6)}` : "Not connected"}</code></p>
            <p style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <strong>Role:</strong>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: rc.bg + "22", color: "#fff", padding: "5px 14px", borderRadius: "20px", border: `1px solid ${rc.bg}55`, fontWeight: "700", fontSize: "0.82rem", letterSpacing: "0.06em", textTransform: "uppercase", boxShadow: `0 0 14px ${rc.glow}` }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: rc.bg, display: "inline-block" }}></span>
                {role}
              </span>
            </p>
          </div>

          {role !== "user" && (
            <div className="issued-documents-section">
              <h3 style={{ textAlign: "center", marginBottom: "20px" }}>📁 File Selection</h3>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                <div className="file-upload-wrapper">
                  <label className={`file-upload-label ${file ? 'has-file' : ''}`} htmlFor="file-input">
                    <span style={{ fontSize: "1.8rem" }}>{file ? "📄" : "📁"}</span>
                    <span>{file ? file.name : "Choose File to Upload"}</span>
                  </label>
                  <input id="file-input" type="file" onChange={handleFileChange} disabled={isLoading} />
                </div>
              </div>
              <div className="hash-display">
                <strong style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Document Hash</strong><br/>
                <span style={{ marginTop: "6px", display: "block" }}>{fileHash32 ? `${fileHash32.slice(0,16)}...${fileHash32.slice(-16)}` : "— No file selected —"}</span>
              </div>
            </div>
          )}

          {error && (
            <div className={`message-box ${error.includes("✅") ? "success" : "error"}`}>
              <strong>{error.includes("✅") ? "✅ Success:" : "❌ Error:"}</strong><br/>{error}
            </div>
          )}

          {isLoading && (
            <div className="loading-container transaction-pending">
              <div className="spinner"></div>
              <p style={{ color: "#a78bfa", fontWeight: "600", fontSize: "0.95rem" }}>⏳ Processing transaction...</p>
            </div>
          )}

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

          {role === "user" && (
            <div className="issued-documents-section">
              <h3 style={{ textAlign: "center", marginBottom: "20px" }}>📚 Issued Documents</h3>
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
                        <td>{doc.fileName || 'Unknown'}</td>
                        <td>{doc.cid ? `${doc.cid.slice(0, 10)}…${doc.cid.slice(-6)}` : 'N/A'}</td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 12px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: "700", background: doc.revoked ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)", color: doc.revoked ? "#fca5a5" : "#6ee7b7", border: `1px solid ${doc.revoked ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}` }}>
                            {doc.revoked ? "❌ Revoked" : "✅ Valid"}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => openQRModal(doc.cid)} style={{ padding: "7px 16px", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem", transition: "all 0.3s ease", boxShadow: "0 4px 12px rgba(102,126,234,0.25)" }}>
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

          <div style={{ textAlign: "center", marginTop: "28px" }}>
            <button
              onClick={() => { setAccount(null); setSigner(null); setFile(null); setFileHash32(""); setError(null); setIsLoading(false); setRole(null); setStep("selectRole"); setFetchedDoc(null); setRoleStatus(null); }}
              style={{ padding: "12px 28px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", fontWeight: "600", fontSize: "0.9rem" }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)"; e.currentTarget.style.color = "#fca5a5"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
            >
              🚪 Logout
            </button>
          </div>

          {fetchedDoc && (
            <div className="document-details">
              <h3 style={{ textAlign: "center", marginBottom: "20px", color: "#e2e8f0" }}>📄 Document Details</h3>
              <div style={{ display: "grid", gap: "10px" }}>
                <p><strong style={{ color: "rgba(255,255,255,0.7)" }}>🏢 Issuer:</strong> <code>{fetchedDoc.issuer}</code></p>
                <p><strong style={{ color: "rgba(255,255,255,0.7)" }}>📎 File Name:</strong> <span style={{ color: "rgba(255,255,255,0.65)" }}>{fetchedDoc.fileName}</span></p>
                <p><strong style={{ color: "rgba(255,255,255,0.7)" }}>🔗 IPFS CID:</strong> <code>{fetchedDoc.ipfsUri}</code></p>
                <p><strong style={{ color: "rgba(255,255,255,0.7)" }}>📅 Issued At:</strong> <span style={{ color: "rgba(255,255,255,0.65)" }}>{fetchedDoc.issuedAt}</span></p>
                <p style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <strong style={{ color: "rgba(255,255,255,0.7)" }}>📊 Status:</strong>
                  <span className={`status-badge ${fetchedDoc.revoked ? 'revoked' : 'valid'}`}>{fetchedDoc.revoked ? "❌ Revoked" : "✅ Valid"}</span>
                </p>
              </div>
            </div>
          )}

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
                  <a href={`https://ipfs.io/ipfs/${selectedDocCID}`} target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none", fontWeight: "700", fontSize: "0.95rem" }}>🔗 Click here to open</a>
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