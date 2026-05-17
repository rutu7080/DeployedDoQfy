// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract DocRegistry is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    struct Document {
        address issuer;
        string fileName;   // original file name
        string ipfsUri;    // IPFS CID
        uint256 issuedAt;
        bool revoked;
    }

    mapping(bytes32 => Document) private documents;
    bytes32[] private issuedDocHashes;

    event DocumentIssued(
        bytes32 indexed docHash,
        address indexed issuer,
        string ipfsUri
    );

    event DocumentRevoked(
        bytes32 indexed docHash,
        address indexed issuer
    );

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
    }

    // ---------------- ROLES ----------------

    function grantIssuerRole(address account)
        external
        onlyRole(ADMIN_ROLE)
    {
        _grantRole(ISSUER_ROLE, account);
    }

    function isAdmin(address account) external view returns (bool) {
        return hasRole(ADMIN_ROLE, account);
    }

    function isIssuer(address account) external view returns (bool) {
        return hasRole(ISSUER_ROLE, account);
    }

    // ---------------- CORE ----------------

    function issueDocument(
        bytes32 docHash,
        string calldata fileName,
        string calldata cid
    ) external onlyRole(ISSUER_ROLE) {
        require(documents[docHash].issuedAt == 0, "Already issued");

        documents[docHash] = Document({
            issuer: msg.sender,
            fileName: fileName,
            ipfsUri: cid,
            issuedAt: block.timestamp,
            revoked: false
        });

        issuedDocHashes.push(docHash);

        emit DocumentIssued(docHash, msg.sender, cid);
    }

    function revokeDocument(bytes32 docHash)
        external
        onlyRole(ISSUER_ROLE)
    {
        require(documents[docHash].issuedAt != 0, "Not issued");
        documents[docHash].revoked = true;

        emit DocumentRevoked(docHash, msg.sender);
    }

    // ---------------- READ ----------------

    // ✅ FIXED: Now returns fileName as well
    function getDocument(bytes32 docHash)
        external
        view
        returns (
            address issuer,
            string memory fileName,
            string memory ipfsUri,
            uint256 issuedAt,
            bool revoked
        )
    {
        Document memory doc = documents[docHash];
        require(doc.issuedAt != 0, "Document not found");

        return (
            doc.issuer,
            doc.fileName,    // ✅ NOW INCLUDED
            doc.ipfsUri,
            doc.issuedAt,
            doc.revoked
        );
    }

    function getAllIssuedDocuments()
        external
        view
        returns (bytes32[] memory)
    {
        return issuedDocHashes;
    }
}
