# SMART-ENERGY-METER-WITH-USAGE-PREDICTION
## Overview
The Smart Energy Meter is an IoT-based web application that monitors electricity consumption in real time. It collects sensor data from an ESP32, displays energy usage through a web dashboard, and provides usage analytics to help users monitor and manage power consumption efficiently.

## Features
- Real-time energy monitoring
- Live dashboard displaying energy usage
- ESP32 integration for sensor data collection
- Usage analytics and visualization
- Responsive web interface
- REST API for communication between hardware and web application

## Tech Stack
### Frontend
- HTML
- CSS
- JavaScript
### Backend
- Python
- Flask
### Hardware
- ESP32
- ACS712 Current Sensor
- ZMPT101B Voltage Sensor
  
## Project Structure
Smart-Energy-Meter/
│
├── backend/
├── frontend/
├── esp32/
├── README.md
├── requirements.txt
├── run.sh
└── run.bat

## Installation
### Clone the repository

```bash
git clone https://github.com/yourusername/Smart-Energy-Meter.git
```
### Navigate to the project

```bash
cd Smart-Energy-Meter
```
### Install dependencies

```bash
pip install -r backend/requirements.txt
```
### Run the application

```bash
python backend/app.py
```
Open your browser and visit:

```
http://localhost:5000
```
## Future Improvements

- User authentication
- Electricity bill prediction
- Smart alerts for excessive usage
- Mobile application support
- Cloud data storage
## Author
Afra Thazkiya
