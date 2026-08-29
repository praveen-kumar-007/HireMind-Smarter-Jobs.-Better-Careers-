import os
import sys

# Ensure backend directory is in sys.path for test discovery and imports
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
