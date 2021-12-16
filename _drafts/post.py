import sys
import datetime
import os

if len(sys.argv) != 2:
    print(f"Usage is python post.py [post_name]")
    exit()

if not os.path.exists("./" + sys.argv[1]):
    print("File must exist in current directory")
    exit()

latest_post = 0

for p in os.listdir("../_posts/"):
    index = int(p[-4])
    if latest_post < index:
        latest_post = index

today = str(datetime.date.today())

post_title = (today+f"-blog-post-{latest_post+1}.md")

os.symlink(sys.argv[1], "../_posts/" + post_title)
