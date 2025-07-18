import socket

HOST = '0.0.0.0'  # Accept connections on all network interfaces
PORT = 12345      # Ensure this port is allowed on your server/firewall

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.bind((HOST, PORT))
    s.listen()
    print(f"Server listening on port {PORT}...")
    conn, addr = s.accept()
    with conn:
        print("Connected by", addr)
        data = conn.recv(1024)
        print("Received:", data.decode())

