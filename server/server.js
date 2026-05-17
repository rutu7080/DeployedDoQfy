const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), async (req, res) => {

    try {

        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded'
            });
        }

        console.log('Uploading file to Pinata...');

        const data = new FormData();

        data.append(
            'file',
            fs.createReadStream(req.file.path)
        );

        const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            data,
            {
                maxBodyLength: Infinity,
                headers: {
                    Authorization: `Bearer ${process.env.PINATA_JWT}`,
                    ...data.getHeaders(),
                },
            }
        );

        const cid = response.data.IpfsHash;

        // delete temporary uploaded file
        fs.unlinkSync(req.file.path);

        console.log('File uploaded successfully!');
        console.log('CID:', cid);

        res.json({
            cid,
            url: `https://gateway.pinata.cloud/ipfs/${cid}`,
            message: 'File uploaded successfully!'
        });

    } catch (error) {

        console.error('Upload failed:', error.message);

        res.status(500).json({
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});