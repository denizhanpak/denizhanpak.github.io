---
title: 'Models for Intelligence'
date: 2021-06-07
permalink: /posts/2/models-for-intelligence/
tags:
  - Philosophy of science
  - Philosophy of mind
  - Games
---

In science we use metaphors all the time. Those metaphors could be mathematical where the phenomena is
described as a formula or an algorithm. They could be physical like using water to explain electricity.
They could also be specific examples. Imagine you were a scientist interested in flight,
how could you study it? You could do experiments with planes, helicopters, birds, insects, bats, rockets, UFOs, 
or more. All of these would be examples of flight. However, which one you focus on will have a big impact on
how you think about flight generally. Sometimes you might even confuse flight with the specific example you are 
studying. This is one of the reasons why a good theoretical foundation is important for any discipline. All of 
these examples are important for building a theory of flight as opposed to 
a theory of helicopters, for example. Aerodynamics doesn't tell us about how eagles work but it can tell us a good bit about 
how they fly. So what could an aerodynamics of intelligence look like?

For this post I want to consider the examples we use in the study of intelligence and how different examples may
emphasize different parts of thinking. A popular definition of intelligence either implicit or explicit is
that it is the ability to solve many problems well. This definition is far from complete and needs work,
but from it we can see that a study of intelligence would require us to decide on a set of problems and define 
what "well" means. One context in which this is easy is games. Games are places with many problems, they also have
clearly defined rules and thus being good or doing well is clear. Games also serve as context in which we can
compare our intelligence to the intelligence of machines relatively easily. Much research in the fields of AI and
cognition has been done on games. So let us consider two games: Chess and Dead Cells.


Chess and Computational Mind
======
Chess is played on a board with 64 tiles.
In the world of chess player 1 makes a move, player 2 makes a move, and so on. There is no parallelism no timing,
just looking at the board and making a decision. 

![Chess GIF](https://media.giphy.com/media/UPvJ4VF6qvyjS/giphy.gif)

I want to make an AI that plays chess. How could I do it?
This is where symbolic manipulations or computationalism comes in. Anyone who has played chess has probably
"thought a few moves ahead." In the world of algorithms we call this process enumeration. I consider the consequence
of one move, if I like it I make it, if not I look at the consequence of the next move and so on. This is a relatively
straightforward way to solve a problem. I look at my options one by one and pick the best one. For chess and many other
daily tasks this is often how I find myself thinking. What's nice about this way of thinking is how easy it is
to implement on a computer. Anyone whose written a for loop before can understand the basic idea.

One limitation is that this is not always possible. Even in chess I can't look at every possible sequence of moves; that would
take too long. However, I can look at the most likely moves. If I have played chess a lot, I know which moves are more common 
than others. I can use probabilities to make rational choices. This is more realistic because sometimes I make mistakes. A
mistake simply means I had the probabilities wrong. By using chess as my example I emphasize certain aspects of play and this
results in certain ways of thinking. Namely, I think of the symbolic manipulations of abstract pieces rather than how a hand 
moves a knight. The specific way in which I move my body, the exact amount of time I spend thinking, the way in which visual
information plays a role are all in a sense non-fundamental. In fact, I can completely determine how to do well by only looking
at the current board state rather than considering historical dependence. The reason I ignore these things
is not necessarily because they are unimportant. They are simply
not the first things I concern myself with when I want to play chess well.

One thing to notice with this way of thinking is that humans are somehow
capable of doing what a computer does. We can make a list of moves, we can calculate probabilities, we can make "rational
choices." This is a result of picking a game in which rationality is well defined. The rational move is the one that brings
you closest to your goal and those moves are simple elements from a discrete set.

Limited Perspective
================
The above example illustrates a family of philosophy of mind called computationalism. In computationalism, thinking is what a computer
does. Humans also think but our hardware is the brain instead of a computer. If your
goal is to understand how humans play chess then maybe this is a good way of framing about the problem. However, to think in these
terms we make some simplifying assumptions: the fact that I have to move a piece with my arms and hands is ignored. The fact that
I have to move my eyes around the board to see all the moves is ignored. The fact that my thoughts have to be very quick and
efficient is generally ignored. Things being ignored isn't that big of a problem: physicists ignore friction, chemists ignore
quantum mechanics, classical economists ignore data. Ignoring things is a big part of science. What you choose to ignore however 
is still
an important question and often depends on your model system. For an alternative let's consider what we ignore and don't ignore
when we take as our example to be Dead Cells instead of Chess.

A Situated Embodied Dynamical Game
===================
For those of you who haven't played: Dead Dells it is a 2D platformer/hack n slash game. You can kill things with your weapons and avoid
getting hit by enemies. Unlike Chess your interactions with the game are in real time. You need to dodge, attack, jump, and plan your way
through to beat a level. This makes it kind of hard to ignore certain facts about the game. You have to consider how quick the system is to
act in the environment, how the environment is being navigated, how a previous decision impacts the next one and so on. What you choose
to ignore has to be different.

![Dead Cells Gameplay GIF](https://thumbs.gfycat.com/RealCheeryFossa-max-1mb.gif)

Taking this to be your model system you will notice three things about thinking that may not be as easily apparent when you think about chess.
First the position of the character in space matters a lot. This is what we call embodiment. It matters what actions a character can take,
what weapon they are using, how high they can jump, and how fast they can travel. All of these features will
fundamentally affect how a given player plays the game. Thus the nature of the body is part of the cognitive (thought) process.

The second thing you'll notice is that it's not just the body which is used to make
decisions. If you watch someone playing Dead Cells they will often dodge into a door. Dodging into a door has the effect of breaking the door.
By breaking the door I create a marker which tells me I have already been in this area. I don't need to remember every place I went to on the
map. I changed the environment so that I can use my senses to make that decision rather than remembering it. Kind of like taking notes in a 
[journal](https://www.nyu.edu/gsas/dept/philo/courses/concepts/clark.html). This second property is what we call situatedness. Situadedness 
means that thinking is not just something
we do with our brains and bodies but we also think using our environment. This is also why usually if you are trying to be more productive
you can move to a different room. A change in your environment is also a change in your mind.

Usually, when we abstract away concepts, the first to go is time. In chess this is relatively easy the turn order is fixed so time isn't
fundamental. We can always solve the problem and then make it faster. If you play Dead Cells though you should know this isn't possible.
Timing is everything. Whether you make it on that platform or dodge that attack you need to time it right. If you pause the game in the middle
of an intense battle and take a break chances are you won't survive when you start back up. You will have lost momentum. 
This is I believe to be one of the most important parts of thought. When we think we are not independent of time. Our
thoughts happen in time. This is the dynamical aspect of cognition.

Dynamics means things that change over time. The dynamics 
only become apparent when we look at certain games to be our model system. As most gamers know however, modern games require a
intuitive and skilled use of timing. If you ignore time it can be easy to think the cognitive work can only be distributed over space. Which
in some sense it is. But it is crucial to understand that cognitive work not only extends over space but also time. The moments between moments
can themselves have computational value which means that the system can embed calculations across time and thus the relevant dynamics can emerge.
This is a fundamental shift from the computationalist view of mind. What makes calculation and computation a useful metaphor for thought is that
they give us objects to look for when studying minds. However, in some cases the computations are so distributed and abstracted that they may
not even be identifiable in the first place. Depending on our model system computation may no longer be a good metaphor for thought at all.

Conclusion
============
So now we know that thinking can happen across bodies, the environment, and time. From here we should start to a see a picture
emerging. Intelligence is not something that we can say happens in one spot in one moment. There is no thought I can point to in my brain.
Instead, thought is continuously happening
all over the place. This shift should make us question how we design our experiments and how we build our models. Most importantly however,
it should make us realize that our examples are only examples and it is after we have looked across many examples that we can start to see
what truth actually looks like.
