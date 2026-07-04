require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();
const PORT    = process.env.API_PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/loans',    require('./routes/loans.cjs'));
app.use('/api/leads',    require('./routes/leads.cjs'));
app.use('/api/tasks',    require('./routes/tasks.cjs'));
app.use('/api/contacts', require('./routes/contacts.cjs'));
app.use('/api/fees', require('./routes/fees.cjs'));
app.use('/api/form1003', require('./routes/form1003.cjs'));

app.listen(PORT, () => console.log(`✅ Jammie API running on port ${PORT}`));
